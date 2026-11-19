// Rain in the light layer (plan ART-17): drawn after the water passes, so the river band gets its ripples, and
// ungraded, so every colour comes from RAIN_LOOKS per key. Back to front: the wet-ground film over the land, the
// puddles (lit reflection of the overcast sky with a lighter near edge), the far and the near streak grids (seamless
// tiles scrolled in whole px), the splashes (≤ RAIN.splashes, ripples in the river band). All normal-blend sprites
// from small CPU textures, batched with the haze band and the light pools.
import { BufferImageSource, Container, Sprite, Texture } from 'pixi.js';
import type { WorldLayout } from '../../content/villages/khortytsia.layout.ts';
import { layerOffset } from '../camera.ts';
import { RAIN, RAIN_LOOKS, WET, type SkyKeyId } from '../atmosphere/config.ts';
import type { DayCycle } from '../atmosphere/dayCycle.ts';
import { paintStreakTile, splashes, streakOffset } from '../atmosphere/rain.ts';
import { claimParticles } from '../fx/registry.ts';
import { rampColor } from '../palette.ts';
import { contentWidth, type LayerSize } from './Layer.ts';
import { riverRowEnd, riverRowsAt } from '../zones.ts';

function bufferTexture(w: number, h: number, pixels: Uint8Array<ArrayBuffer>): Texture {
  const source = new BufferImageSource({
    resource: pixels,
    width: w,
    height: h,
    format: 'rgba8unorm',
    alphaMode: 'premultiplied-alpha',
    scaleMode: 'nearest',
    autoGenerateMipmaps: false,
  });
  return new Texture({ source });
}

/** A small mask texture from rows of '#' (white), '+' (grey), 'o' (dark) and '.' (empty), for tinting. */
function maskTexture(rows: readonly string[], grey = 200): Texture {
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const px = new Uint8Array(w * h * 4);
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const c = row[x];
      const v = c === '#' ? 225 : c === '+' ? grey : c === 'o' ? 80 : 0;
      if (v > 0) px.set([v, v, v, 255], (y * w + x) * 4);
    }
  });
  return bufferTexture(w, h, px);
}

/**
 * Puddle: a flat ellipse `w` wide, 3 rows — the far (upper) rim the lit sky caught in the water (full tint), the
 * middle row a duller reflection, the near row dark (the wet hollow); tinted with the key's puddle colour.
 */
function puddleRows(w: number): string[] {
  const row = (inset: number, ch: string): string =>
    '.'.repeat(inset) + ch.repeat(Math.max(1, w - 2 * inset)) + '.'.repeat(inset);
  return [row(2, '#'), row(0, '+'), row(1, 'o')];
}

const blend = (cycle: DayCycle, pick: (id: SkyKeyId) => number): number =>
  pick(cycle.keyA) + (pick(cycle.keyB) - pick(cycle.keyA)) * cycle.t;
/** The wet-ground film's alpha at `cycle` (RAIN_LOOKS.wet blended, in 1/16 steps): also laid over the boats (M2-11). */
export const wetAlpha = (cycle: DayCycle): number => Math.round(blend(cycle, (id) => RAIN_LOOKS[id].wet) * 16) / 16;
const dominant = (cycle: DayCycle): SkyKeyId => (cycle.t < 0.5 ? cycle.keyA : cycle.keyB);

export interface Rain {
  readonly container: Container;
  resize(size: LayerSize, horizon: number): void;
  update(seconds: number, cycle: DayCycle, camX: number): void;
  /** Tier budget (ART-18): splashes shown (0 under «менше руху») and whether the far streak layer draws. */
  setBudget(splashes: number, far: boolean): void;
  dispose(): void;
}

export function createRain(layout: WorldLayout): Rain {
  const container = new Container({ label: 'rain' });
  // The wet-ground film (world space): below the river from its last row down, and the dry land beside the river from
  // the horizon — one 1-row strip per river row where that row is land (M2-01: no river in the Sich).
  const wet = new Container({ label: 'wet' });
  const wetTint = rampColor(...WET.color);
  const wetStrip = (x: number, y: number, w: number, h: number): void => {
    if (w <= 0 || h <= 0) return;
    const strip = new Sprite({ texture: Texture.WHITE, roundPixels: true });
    strip.tint = wetTint;
    strip.position.set(x, y);
    strip.width = w;
    strip.height = h;
    wet.addChild(strip);
  };
  const puddleLayer = new Container({ label: 'puddles' });
  const far = new Container({ label: 'rain-far' });
  const near = new Container({ label: 'rain-near' });
  const splashLayer = new Container({ label: 'splashes' });
  container.addChild(wet, puddleLayer, far, near, splashLayer);

  const owned: Texture[] = [];
  const own = (t: Texture): Texture => {
    owned.push(t);
    return t;
  };
  const farTile = own(
    bufferTexture(RAIN.tile, RAIN.tile, paintStreakTile(RAIN.tile, RAIN.far.count, RAIN.far.len, RAIN.slant, 3)),
  );
  const nearTile = own(
    bufferTexture(RAIN.tile, RAIN.tile, paintStreakTile(RAIN.tile, RAIN.near.count, RAIN.near.len, RAIN.slant, 9)),
  );
  const splashTex = own(maskTexture(['#.#', '.#.']));
  const rippleTex = own(maskTexture(['##.##']));
  const puddleTex = new Map<number, Texture>();
  const puddles = layout.puddles.map((p) => {
    let tex = puddleTex.get(p.w);
    if (!tex) {
      tex = own(maskTexture(puddleRows(p.w)));
      puddleTex.set(p.w, tex);
    }
    const sprite = new Sprite({ texture: tex, roundPixels: true });
    puddleLayer.addChild(sprite);
    return { p, sprite };
  });
  const drops = Array.from({ length: RAIN.splashes }, () => {
    const s = new Sprite({ texture: Texture.WHITE, roundPixels: true });
    s.visible = false;
    splashLayer.addChild(s);
    return s;
  });
  const claim = claimParticles();
  let splashLimit = drops.length;
  claim.set(splashLimit);
  let size: LayerSize | null = null;
  let horizon = 0;

  /** Fills `into` with a grid of `tile` sprites covering the view plus one spare tile each way. */
  const grid = (into: Container, tile: Texture, s: LayerSize): void => {
    for (const child of into.removeChildren()) child.destroy();
    for (let y = -RAIN.tile; y < s.viewH; y += RAIN.tile) {
      for (let x = -RAIN.tile; x < s.viewW; x += RAIN.tile) {
        const sprite = new Sprite({ texture: tile, roundPixels: true });
        sprite.position.set(x, y);
        into.addChild(sprite);
      }
    }
  };

  return {
    container,
    resize: (s, h) => {
      size = s;
      horizon = h;
      grid(far, farTile, s);
      grid(near, nearTile, s);
      for (const child of wet.removeChildren()) child.destroy();
      const worldW = contentWidth(1, s);
      const river = layout.river;
      const rows = Math.min(river?.rows ?? 0, Math.max(0, s.viewH - horizon));
      wetStrip(0, horizon + rows, worldW, s.viewH - horizon - rows);
      for (let r = 0; r < rows && river; r++) {
        wetStrip(0, horizon + r, river.x0, 1);
        const end = riverRowEnd(river, r);
        wetStrip(end, horizon + r, worldW - end, 1);
      }
    },
    update: (seconds, cycle, camX) => {
      if (!size) return;
      const look = RAIN_LOOKS[dominant(cycle)];
      const streak = rampColor(...look.streak);
      wet.alpha = wetAlpha(cycle);
      const offset = layerOffset(camX, 1);
      wet.x = offset;
      const puddle = rampColor(...look.puddle);
      const ripple = rampColor(...look.ripple);
      for (const { p, sprite } of puddles) {
        sprite.tint = puddle;
        sprite.position.set(p.x - Math.floor(p.w / 2) + offset, horizon + p.ground);
      }
      for (const [layer, spec] of [
        [far, RAIN.far],
        [near, RAIN.near],
      ] as const) {
        const o = streakOffset(seconds, spec.speed, RAIN.tile, RAIN.slant);
        layer.position.set(o.x, o.y);
        layer.alpha = spec.alpha;
        layer.tint = streak;
      }
      const river = layout.river;
      const list = splashes(seconds, {
        x0: 0,
        x1: size.viewW,
        y0: horizon,
        y1: size.viewH,
        water: (x) => riverRowsAt(river, x - offset),
      });
      drops.forEach((d, i) => {
        const s = list[i];
        d.visible = s !== undefined && i < splashLimit;
        if (!s) return;
        d.tint = s.kind === 'ripple' ? ripple : streak;
        if (s.stage === 0) {
          d.texture = Texture.WHITE;
          d.position.set(s.x, s.y);
        } else if (s.kind === 'ripple') {
          d.texture = rippleTex;
          d.position.set(s.x - 2, s.y);
        } else {
          d.texture = splashTex;
          d.position.set(s.x - 1, s.y - 1);
        }
      });
    },
    setBudget: (splashes, showFar) => {
      splashLimit = Math.min(drops.length, splashes);
      claim.set(splashLimit);
      far.visible = showFar;
    },
    dispose: () => {
      claim.release();
      container.destroy({ children: true });
      for (const t of owned) t.destroy(true);
    },
  };
}
