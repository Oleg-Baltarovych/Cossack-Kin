// Layer 7 — light and atmosphere (screen-fixed, ungraded; ART-08/10):
// - the haze band over the ground under the horizon (atmosphere/landscapePaint.ts): strength by time of day
//   (HAZE_LEVELS), a dense bank with `weather=fog`;
// - light shafts from a low sun (ART-10, ART-BIBLE §8: dawn and golden hour, through cloud gaps) by quality tier
//   (art-director decision, plan ART-10): `high` = occlusion at full resolution, 8 repaints/s; `med` (and auto) =
//   occlusion at ½ resolution, 4/s — a polar shadow map from the sun through the clouds, bluffs and groves, the light
//   reaching the meadow through the gaps; `low` = a fan of 5 static beams clipped by the bluffs and the horizon, faded
//   out while the sun is behind a cloud. The GodrayFilter variant was dropped (blur over the pixel grid, no occlusion,
//   the slowest). Additive, plus ≤ 40 dust motes in the brighter light.
import { BufferImageSource, Container, Sprite, Texture, type BLEND_MODES } from 'pixi.js';
import type { SceneLayout } from '../../content/villages/khortytsia.layout.ts';
import { layerOffset } from '../camera.ts';
import { CLOUD_FOOTPRINTS, CLOUDS, FOG, HAZE_BAND, LOW_CLOUD, RAY_LOOKS, RAYS } from '../atmosphere/config.ts';
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
import type { Quality, Weather } from '../settings.ts';
import { cloudX } from './Clouds.ts';
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
  readonly layout: SceneLayout;
}

export function createLightLayer({ weather, quality, layout }: LightLayerOptions): WorldLayer {
  const variant = rayVariant(quality);
  const tier = variant === 'occlusion-full' ? RAYS.high : RAYS.med;
  return createLayer('light', 0, (container) => {
    const haze = new Sprite({ roundPixels: true, label: 'haze-band' });
    const rays = new Container({ label: `rays-${variant}` });
    const dust = new Container({ label: 'dust' });
    container.addChild(haze, rays, dust);
    let hazeBuf: CpuTexture | null = null;
    let shaftBuf: CpuTexture | null = null;
    let beams: { tex: CpuTexture; sprite: Sprite }[] = [];
    let size: LayerSize | null = null;
    let horizon = 0;
    let profiles: { plane: SceneLayout['farPlanes'][number]; parallax: number; profile: Profile }[] = [];
    let hazeKey = '';
    let beamKey = '';
    let shaftKey = '';
    let shaftMap: Float32Array | null = null;
    let grid: { key: string; value: PolarGrid } | null = null;
    let beamGate = Number.NaN;
    let lastSeconds = Number.NaN;
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

    return {
      resize: (s) => {
        free();
        size = s;
        horizon = horizonY(s.viewH);
        haze.y = horizon - lead;
        hazeBuf = cpuTexture(s.viewW, MAX_ROWS);
        haze.texture = hazeBuf.texture;
        hazeKey = '';
        beamKey = '';
        shaftKey = '';
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
      },
      update: ({ minutes, seconds, cycle, camX }) => {
        if (!size || !hazeBuf) return;
        const bucket = `${String(lutBucket(minutes))}:${cycle.keyA}:${cycle.keyB}`;
        if (bucket !== hazeKey) {
          hazeKey = bucket;
          const { haze: h } = airHaze(cycle, weather);
          const fog = weather === 'fog';
          const rows = fog ? FOG.bandRows : Math.round(HAZE_BAND.rows[0] + (HAZE_BAND.rows[1] - HAZE_BAND.rows[0]) * h);
          const cover = layout.groundHaze === false ? 0 : fog ? FOG.bandCover : HAZE_BAND.cover * h;
          paintHazeBand(hazeBuf.pixels, hazeBuf.w, Math.min(rows, MAX_ROWS - lead), cycle, cover, lead);
          hazeBuf.source.update();
        }

        // Shafts: only with a low sun on screen, never in fog (ART-17 decides fog light).
        const look = rayLook(cycle);
        const sunPx = skyPixel(cycle.sun, size.viewW, horizon);
        const sun: Point = { x: sunPx.x, y: sunPx.y };
        const on = look.level > 0.01 && weather !== 'fog' && cycle.sun.y > -0.02 && sun.y < horizon + 4;
        rays.visible = on;
        dust.visible = on;
        const dt = Number.isNaN(lastSeconds) ? 0 : Math.max(0, seconds - lastSeconds);
        lastSeconds = seconds;
        if (!on) return;
        rays.alpha = look.level;

        let lit: (x: number, y: number) => number;
        if (variant !== 'beams' && shaftBuf) {
          // The shadow map and the paint refresh tier.repaintHz times a second (clouds drift ~1–2 px/s).
          const key = `${bucket}:${String(Math.floor(seconds * tier.repaintHz))}:${String(camX)}`;
          if (key !== shaftKey || !shaftMap) {
            shaftKey = key;
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
          const key = `${bucket}:${String(sun.x)}:${String(sun.y)}:${String(camX)}`;
          if (key !== beamKey) {
            beamKey = key;
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
          m.visible = mote !== undefined && mote.glow > 0;
          if (!mote || !m.visible) return;
          m.position.set(mote.x, mote.y);
          m.tint = look.dust;
        });
      },
      dispose: free,
    };
  });
}
