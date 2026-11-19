// Layer 7 — light and atmosphere (screen-fixed, ungraded; ART-08/10):
// - the haze band over the ground under the horizon (atmosphere/landscapePaint.ts): strength by time of day
//   (HAZE_LEVELS), a dense bank with `weather=fog`; painted over the whole world and scrolled with the ground, its
//   cover per column from the zones (M2-01: none over the Sich's rampart, faded out at the edge);
// - light shafts from a low sun (ART-10, ART-BIBLE §8: dawn and golden hour, through cloud gaps) by quality tier
//   (art-director decision, plan ART-10): `high` = occlusion at full resolution, 8 repaints/s; `med` (and auto) =
//   occlusion at ½ resolution, 4/s — a polar shadow map from the sun through the clouds, bluffs and groves, the light
//   reaching the meadow through the gaps; `low` = a fan of 5 static beams clipped by the bluffs and the horizon, faded
//   out while the sun is behind a cloud. The GodrayFilter variant was dropped (blur over the pixel grid, no occlusion,
//   the slowest). Additive, plus ≤ 40 dust motes in the brighter light;
// - night lights (ART-16): warm pools on the ground under the campfire (flickering) and in front of every building
//   with a night mask (alpha-blended right after the haze band, so they batch with it), and summer fireflies (≤ 40,
//   additive, with the dust) — sprites in world positions, by the emissive level.
import { BufferImageSource, Container, Sprite, Texture, type BLEND_MODES } from 'pixi.js';
import type { WorldLayout } from '../../content/villages/khortytsia.layout.ts';
import { layerOffset } from '../camera.ts';
import {
  CLOUD_FOOTPRINTS,
  CLOUDS,
  FIREFLIES,
  FOG,
  HAZE_BAND,
  LOW_CLOUD,
  RAY_LOOKS,
  RAYS,
  POOLS,
  QUALITY_TIERS,
} from '../atmosphere/config.ts';
import { emissiveLevel } from '../atmosphere/emissive.ts';
import { fireflies, flicker, paintPool, poolLook } from '../atmosphere/nightLights.ts';
import { claimParticles } from '../fx/registry.ts';
import type { DayCycle } from '../atmosphere/dayCycle.ts';
import { lutBucket } from '../atmosphere/grading.ts';
import { paintHazeBand, planeProfile, type Profile } from '../atmosphere/landscapePaint.ts';
import {
  binOf,
  dustMotes,
  paintBeam,
  paintShafts,
  polarGrid,
  shadowMap,
  shaftStep,
  type Occluders,
  type Point,
  type PolarGrid,
} from '../atmosphere/rays.ts';
import { skyPixel } from '../atmosphere/skyPaint.ts';
import { rampColor } from '../palette.ts';
import { plotShown } from '../scene.ts';
import type { Quality, Weather } from '../settings.ts';
import { cloudX } from './Clouds.ts';
import { propFrames } from './Ground.ts';
import { createRain } from './rainLayer.ts';
import { hazeCover } from '../zones.ts';
import { airHaze, PLANE_ROWS } from './landscape.ts';
import { contentWidth, createLayer, horizonY, type LayerSize, type WorldLayer } from './Layer.ts';

const MAX_ROWS = Math.max(FOG.bandRows + FOG.leadRows, HAZE_BAND.rows[1]);
const ADD: BLEND_MODES = 'add';

export type RayVariant = 'occlusion-full' | 'occlusion-half' | 'beams';
/** Quality tier → shaft variant (ART-10 decision). */
export function rayVariant(quality: Quality | null): RayVariant {
  return quality === 'high' ? 'occlusion-full' : quality === 'low' ? 'beams' : 'occlusion-half';
}

interface CpuTexture {
  readonly w: number;
  readonly h: number;
  readonly pixels: Uint8Array;
  readonly source: BufferImageSource;
  readonly texture: Texture;
}
function cpuTexture(w: number, h: number, pixels: Uint8Array<ArrayBuffer> = new Uint8Array(w * h * 4)): CpuTexture {
  const source = new BufferImageSource({
    resource: pixels,
    width: w,
    height: h,
    format: 'rgba8unorm',
    alphaMode: 'premultiplied-alpha',
    scaleMode: 'nearest',
    autoGenerateMipmaps: false,
  });
  return { w, h, pixels, source, texture: new Texture({ source }) };
}

const rayLook = (cycle: DayCycle): { level: number; color: number; dust: number } => {
  const a = RAY_LOOKS[cycle.keyA];
  const b = RAY_LOOKS[cycle.keyB];
  const dominant = cycle.t < 0.5 ? a : b;
  return {
    level: a.level + (b.level - a.level) * cycle.t,
    color: rampColor(...dominant.color),
    dust: rampColor(...dominant.dust),
  };
};

export interface LightLayerOptions {
  readonly weather: Weather;
  readonly quality: Quality | null;
  readonly layout: WorldLayout;
  /** Scene atlas lookup, `null` for a missing frame (which props have a night mask, and their width). */
  readonly findFrame: (name: string) => Texture | null;
  /** «Менше руху»: no dust, fireflies or splashes; everything else holds a still frame (ART-18). */
  readonly lessMotion: boolean;
}

export function createLightLayer({ weather, quality, layout, findFrame, lessMotion }: LightLayerOptions): WorldLayer {
  // Mutable: the auto-detect may switch the tier once (ART-18); the shafts are rebuilt on the next resize.
  let variant = rayVariant(quality);
  let tier: typeof RAYS.high | typeof RAYS.med = variant === 'occlusion-full' ? RAYS.high : RAYS.med;
  let budget = QUALITY_TIERS[quality ?? 'med'];
  return createLayer('light', 0, (container) => {
    const haze = new Sprite({ roundPixels: true, label: 'haze-band' });
    const rays = new Container({ label: 'rays' });
    const dust = new Container({ label: 'dust' });
    const night = new Container({ label: 'light-pools' });
    const flyLayer = new Container({ label: 'fireflies' });
    // Rain (ART-17) after the pools: normal blend, so haze, pools and rain are one batch.
    const rain = weather === 'rain' ? createRain(layout) : null;
    rain?.setBudget(lessMotion ? 0 : budget.splashes, budget.rainFar);
    container.addChild(haze, night, ...(rain ? [rain.container] : []), rays, dust, flyLayer);
    // Light pools: one texture per size, shared by the sprites (fire: round; windows: flat, by the building's width).
    const poolTextures = new Map<string, CpuTexture>();
    const poolTexture = (rx: number, ry: number, color: number): Texture => {
      const key = `${String(rx)}:${String(ry)}:${String(color)}`;
      let tex = poolTextures.get(key);
      if (!tex) {
        const img = paintPool(rx, ry, color);
        tex = cpuTexture(img.w, img.h, img.pixels);
        poolTextures.set(key, tex);
      }
      return tex.texture;
    };
    // Flicker seeds count props from their zone's first one (M2-01): each zone keeps the flicker of its M-ART scene.
    const zoneOf = (x: number): number => layout.zones.findIndex((z) => x >= z.x0 && x < z.x1);
    const pools = layout.props.flatMap((prop, i) => {
      const zone = zoneOf(prop.x);
      const seed = i - layout.props.findIndex((q) => zoneOf(q.x) === zone);
      const mask = findFrame(propFrames(prop.sprite).emissive);
      const look = poolLook(prop, mask ? mask.width : null);
      if (!look) return [];
      const sprite = new Sprite({
        texture: poolTexture(look.rx, look.ry, rampColor(look.color[0], look.color[1])),
        roundPixels: true,
      });
      sprite.anchor.set(0.5);
      night.addChild(sprite);
      // A fire's pool centres on the flames; a window pool lies on the ground in front of the wall.
      const { fire, below } = look;
      return [{ prop, sprite, fire, seed, below, alpha: look.alpha }];
    });
    // A firefly at its blink peak: the lit px with a dim + of 4 neighbours (1/4), white so the tint colours it.
    const flyPeakBuf = cpuTexture(
      3,
      3,
      new Uint8Array([
        0, 0, 0, 0, 64, 64, 64, 64, 0, 0, 0, 0, 64, 64, 64, 64, 255, 255, 255, 255, 64, 64, 64, 64, 0, 0, 0, 0, 64, 64,
        64, 64, 0, 0, 0, 0,
      ]),
    );
    const flyPeak = flyPeakBuf.texture;
    const flies =
      layout.fireflies.length > 0
        ? Array.from({ length: FIREFLIES.count }, () => {
            const m = new Sprite({ texture: Texture.WHITE, roundPixels: true });
            m.blendMode = ADD;
            m.tint = rampColor(...FIREFLIES.color);
            m.visible = false;
            flyLayer.addChild(m);
            return m;
          })
        : [];
    // Particle limits by tier (0 under «менше руху»), computed once per tier change. The claim is the tier's ceiling
    // (dust only shows in shafts, fireflies only at night): the budget check is against the worst case.
    const claim = claimParticles();
    let dustLimit = 0;
    let flyLimit = 0;
    const applyBudget = (): void => {
      dustLimit = lessMotion ? 0 : Math.min(RAYS.dust, budget.dust);
      flyLimit = lessMotion ? 0 : Math.min(flies.length, budget.fireflies);
      claim.set(dustLimit + flyLimit);
    };
    applyBudget();
    let hazeBuf: CpuTexture | null = null;
    let hazeCovers: number[] = [];
    /** Per-column top cover of the clear-air band for the current bucket (cover × haze level). */
    let hazeRow: number[] = [];
    let shaftBuf: CpuTexture | null = null;
    let beams: { tex: CpuTexture; sprite: Sprite }[] = [];
    let size: LayerSize | null = null;
    let horizon = 0;
    let profiles: { plane: WorldLayout['farPlanes'][number]; parallax: number; profile: Profile }[] = [];
    let hazeKey = '';
    let beamKey = '';
    let shaftKey = '';
    let shaftMap: Float32Array | null = null;
    let grid: { key: string; value: PolarGrid } | null = null;
    let beamGate = Number.NaN;
    let lastSeconds = Number.NaN;
    // The camera the shafts / beams were last painted for, and when (M2-02: while the camera moves they repaint at
    // most tier.repaintHz times a second; once it settles, at once for the exact position).
    let paintedCam = Number.NaN;
    let paintedAt = Number.NEGATIVE_INFINITY;
    const lead = weather === 'fog' ? FOG.leadRows : 0;
    const motes = Array.from({ length: RAYS.dust }, () => {
      const m = new Sprite({ texture: Texture.WHITE, roundPixels: true });
      m.blendMode = ADD;
      m.visible = false;
      dust.addChild(m);
      return m;
    });

    const freeBeams = (): void => {
      for (const b of beams) {
        b.sprite.destroy();
        b.tex.texture.destroy(true);
      }
      beams = [];
    };
    const free = (): void => {
      haze.texture = Texture.EMPTY;
      hazeBuf?.texture.destroy(true);
      hazeBuf = null;
      freeBeams();
      for (const child of rays.removeChildren()) child.destroy();
      shaftBuf?.texture.destroy(true);
      shaftBuf = null;
    };
    const dispose = (): void => {
      free();
      claim.release();
      rain?.dispose();
      for (const tex of poolTextures.values()) tex.texture.destroy(true);
      flyPeak.destroy(true);
      poolTextures.clear();
    };

    /** Clouds on screen this frame as ellipses (footprints of the generated sprites). */
    const cloudsAt = (seconds: number, camX: number): { cx: number; cy: number; rx: number; ry: number }[] => {
      if (!size) return [];
      const span = contentWidth(0.1, size);
      const offset = layerOffset(camX, 0.1);
      return CLOUDS.map((c) => {
        const fp = CLOUD_FOOTPRINTS[c.variant];
        const h = c.y > LOW_CLOUD.below ? fp.h * LOW_CLOUD.scaleY : fp.h;
        const base = Math.round(horizon * c.y);
        return { cx: cloudX(c, seconds, span) + offset, cy: base - h / 2, rx: fp.w / 2, ry: h / 2 };
      });
    };
    /**
     * Occluders: clouds (optional, ellipse footprints) and the bluffs and groves on the horizon as one height field.
     * The far steppe is too low and too far to cast shafts (it would block every ray to the meadow).
     */
    const occluderAt = (seconds: number, camX: number, withClouds: boolean): Occluders => {
      const planes = profiles
        .filter((p) => p.plane.kind !== 'steppe')
        .map((p) => ({ profile: p.profile, offset: layerOffset(camX, p.parallax) }));
      return {
        ellipses: withClouds ? cloudsAt(seconds, camX) : [],
        horizon,
        maxHeight: PLANE_ROWS,
        height: (x) => {
          let h = 0;
          for (const p of planes) h = Math.max(h, p.profile.height[x - p.offset] ?? 0);
          return h;
        },
      };
    };

    const rebuild = (s: LayerSize): void => {
      free();
      size = s;
      horizon = horizonY(s.viewH);
      haze.y = horizon - lead;
      rain?.resize(s, horizon);
      const worldW = contentWidth(1, s);
      hazeBuf = cpuTexture(worldW, MAX_ROWS);
      hazeCovers = hazeCover(layout.segments, worldW, HAZE_BAND.edge);
      hazeRow = new Array<number>(worldW).fill(0);
      haze.texture = hazeBuf.texture;
      hazeKey = '';
      beamKey = '';
      shaftKey = '';
      paintedCam = Number.NaN;
      shaftMap = null;
      grid = null;
      profiles = layout.farPlanes.map((plane) => {
        const parallax = plane.layer === 'far' ? 0.2 : 0.5;
        return { plane, parallax, profile: planeProfile(plane, contentWidth(parallax, s)) };
      });
      if (variant !== 'beams') {
        shaftBuf = cpuTexture(Math.ceil(s.viewW / tier.scale), Math.ceil(s.viewH / tier.scale));
        const sprite = new Sprite({ texture: shaftBuf.texture, roundPixels: true });
        sprite.scale.set(tier.scale);
        sprite.blendMode = ADD;
        rays.addChild(sprite);
      }
    };

    return {
      resize: rebuild,
      setQuality: (q) => {
        variant = rayVariant(q);
        tier = variant === 'occlusion-full' ? RAYS.high : RAYS.med;
        budget = QUALITY_TIERS[q];
        rain?.setBudget(lessMotion ? 0 : budget.splashes, budget.rainFar);
        applyBudget();
        if (size) rebuild(size);
      },
      update: ({ minutes, ambient: seconds, cycle, camX, scene, cameraMoving, nowMs, skyY }) => {
        if (!size || !hazeBuf) return;
        const bucket = `${String(lutBucket(minutes))}:${cycle.keyA}:${cycle.keyB}`;
        if (bucket !== hazeKey) {
          hazeKey = bucket;
          const { haze: h } = airHaze(cycle, weather);
          const fog = weather === 'fog';
          const rows = fog ? FOG.bandRows : Math.round(HAZE_BAND.rows[0] + (HAZE_BAND.rows[1] - HAZE_BAND.rows[0]) * h);
          // Fog covers the near ground too, even where the clear-air band is off (the Sich rampart, ART-17).
          const clear = HAZE_BAND.cover * h;
          if (!fog) hazeCovers.forEach((c, x) => (hazeRow[x] = clear * c));
          const cover = fog ? FOG.bandCover : hazeRow;
          paintHazeBand(hazeBuf.pixels, hazeBuf.w, Math.min(rows, MAX_ROWS - lead), cycle, cover, lead, weather);
          hazeBuf.source.update();
        }

        // Night lights: pools and fireflies follow the emissive level (off by day), in world positions.
        const level = emissiveLevel(cycle);
        const poolLevel = Math.max(0, (level - POOLS.from) / (1 - POOLS.from));
        night.visible = poolLevel > 0;
        flyLayer.visible = level > 0.5 && weather === 'clear';
        rain?.update(seconds, cycle, camX);
        haze.x = layerOffset(camX, 1);
        if (level > 0.01) {
          const offset = layerOffset(camX, 1);
          for (const p of pools) {
            // A window pool only in front of a building that stands (M1-19).
            p.sprite.visible = plotShown(p.prop.plot, scene.tiers);
            p.sprite.position.set(p.prop.x + offset, horizon + p.prop.ground + p.below);
            const f = p.fire ? flicker(seconds, p.seed) : flicker(seconds * 0.25, p.seed, 0.125);
            p.sprite.alpha = Math.round(p.alpha * poolLevel * f * 8) / 8;
          }
        }
        // Fireflies of each zone's area on screen (M2-01): one shared pool; an area gets the tier's limit per
        // FIREFLIES.span px of its width (the M-ART farm: all of it), so the density holds across a zone edge.
        if (flyLayer.visible && flyLimit > 0 && flies.length > 0) {
          const offset = layerOffset(camX, 1);
          const view = { x0: camX - 3, x1: camX + size.viewW + 3 };
          const list = layout.fireflies
            .filter((area) => area.x1 > view.x0 && area.x0 < view.x1)
            .flatMap((area) =>
              fireflies(seconds, { x0: area.x0, x1: area.x1, y0: horizon + area.top, y1: horizon + area.bottom })
                .slice(0, Math.round((flyLimit * (area.x1 - area.x0)) / FIREFLIES.span))
                .filter((fly) => fly.on && fly.x >= view.x0 && fly.x < view.x1),
            );
          flies.forEach((m, i) => {
            const fly = i < flyLimit ? list[i] : undefined;
            m.visible = fly !== undefined;
            if (!fly) return;
            m.texture = fly.peak ? flyPeak : Texture.WHITE;
            // Whole px, top-left anchored: the 3×3 peak sits one px up-left so its centre stays on the firefly.
            m.position.set(fly.x + offset - (fly.peak ? 1 : 0), fly.y - (fly.peak ? 1 : 0));
          });
        }

        // Shafts: only with a low sun on screen, never in fog (ART-17 decides fog light).
        const look = rayLook(cycle);
        const sunPx = skyPixel(cycle.sun, size.viewW, horizon);
        const sun: Point = { x: sunPx.x, y: sunPx.y + skyY };
        const on = look.level > 0.01 && weather === 'clear' && cycle.sun.y > -0.02 && sun.y < horizon + 4;
        rays.visible = on;
        dust.visible = on;
        const dt = Number.isNaN(lastSeconds) ? 0 : Math.max(0, seconds - lastSeconds);
        lastSeconds = seconds;
        if (!on) return;
        rays.alpha = look.level;

        // A moved camera shifts the far planes and clouds that cast the shafts: repaint for it, rate-limited while moving.
        const camDue = camX !== paintedCam && (!cameraMoving || nowMs - paintedAt >= 1000 / tier.repaintHz);
        const markPainted = (): void => {
          paintedCam = camX;
          paintedAt = nowMs;
        };
        let lit: (x: number, y: number) => number;
        if (variant !== 'beams' && shaftBuf) {
          // The shadow map and the paint refresh tier.repaintHz times a second (clouds drift ~1–2 px/s).
          const key = `${bucket}:${String(Math.floor(seconds * tier.repaintHz))}`;
          if (key !== shaftKey || !shaftMap || camDue) {
            shaftKey = key;
            markPainted();
            shaftMap = shadowMap(sun, occluderAt(seconds, camX, true), RAYS.reach, RAYS.bins);
            // Polar coordinates per px are cached while the sun stays on the same px.
            const gridKey = `${String(sun.x)}:${String(sun.y)}`;
            if (grid?.key !== gridKey) {
              grid = {
                key: gridKey,
                value: polarGrid(shaftBuf.w, shaftBuf.h, sun, tier.scale, RAYS.reach, RAYS.bins),
              };
            }
            paintShafts(
              shaftBuf.pixels,
              shaftBuf.w,
              shaftBuf.h,
              sun,
              shaftMap,
              look.color,
              { reach: RAYS.reach, cover: RAYS.cover, scale: tier.scale, horizon },
              grid.value,
            );
            shaftBuf.source.update();
          }
          const map = shaftMap;
          lit = (x, y) => {
            const d = Math.hypot(x - sun.x, y - sun.y);
            return d > (map[binOf(sun, x, y, map.length)] ?? RAYS.reach) ? 0 : shaftStep(d, RAYS.reach);
          };
        } else {
          const key = `${bucket}:${String(sun.x)}:${String(sun.y)}`;
          if (key !== beamKey || camDue) {
            beamKey = key;
            markPainted();
            freeBeams();
            const map = shadowMap(sun, occluderAt(seconds, camX, false), RAYS.reach, RAYS.bins);
            beams = RAYS.beams.map((angle) => {
              const img = paintBeam(sun, angle, RAYS.reach, RAYS.beamWidth, look.color, RAYS.cover, map, horizon);
              const tex = cpuTexture(img.w, img.h, img.pixels);
              const sprite = new Sprite({ texture: tex.texture, roundPixels: true });
              sprite.position.set(img.x, img.y);
              sprite.blendMode = ADD;
              rays.addChild(sprite);
              return { tex, sprite };
            });
          }
          // Gate: fade the fan out while the sun's centre is inside a cloud (and back in), over RAYS.beamFade s.
          const covered = cloudsAt(seconds, camX).some((c) => {
            const u = (sun.x - c.cx) / c.rx;
            const v = (sun.y - c.cy) / c.ry;
            return u * u + v * v < 1;
          });
          const target = covered ? 0 : 1;
          beamGate =
            Number.isNaN(beamGate) || dt === 0
              ? target
              : beamGate + (target - beamGate) * Math.min(1, dt / RAYS.beamFade);
          const gate = beamGate;
          // Each beam breathes on its own slow phase (quantized to 8 steps: no smooth alpha crawl).
          beams.forEach((b, i) => {
            const phase = Math.sin(seconds * 0.6 + i * 1.7);
            b.sprite.alpha = Math.round((0.55 + 0.45 * phase) * gate * 8) / 8;
          });
          lit = (x, y) => {
            const d = Math.hypot(x - sun.x, y - sun.y);
            return gate > 0.5 && y < horizon && x > sun.x ? shaftStep(d, RAYS.reach) : 0;
          };
        }

        const list = dustMotes(sun, RAYS.reach, RAYS.dust, seconds, lit);
        motes.forEach((m, i) => {
          const mote = list[i];
          m.visible = mote !== undefined && mote.glow > 0 && i < dustLimit;
          if (!mote || !m.visible) return;
          m.position.set(mote.x, mote.y);
          m.tint = look.dust;
        });
      },
      dispose,
    };
  });
}
