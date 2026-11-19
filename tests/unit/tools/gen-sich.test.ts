// Sich tier art (plan M2-09, ART-BIBLE §4/§6): every new base stays inside the building colour budget, the tier
// chains that start from an M1 frame (tower, church) grow and change silhouette tier to tier, and the wind-blown
// корогва hangs exactly at the hoist of the pole under it.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import banner, { BANNER_CLOTH } from '../../../assets-src/gen/khortytsia/banner/index.ts';
import brama from '../../../assets-src/gen/khortytsia/brama/index.ts';
import church from '../../../assets-src/gen/khortytsia/church/index.ts';
import flagpole, { FLAGPOLE_HOIST } from '../../../assets-src/gen/khortytsia/flagpole/index.ts';
import gate, { BANNER_HOIST } from '../../../assets-src/gen/khortytsia/gate/index.ts';
import kazan from '../../../assets-src/gen/khortytsia/kazan/index.ts';
import koshovyi from '../../../assets-src/gen/khortytsia/koshovyi/index.ts';
import kurin from '../../../assets-src/gen/khortytsia/kurin/index.ts';
import kurinB from '../../../assets-src/gen/khortytsia/kurin-b/index.ts';
import kurinC from '../../../assets-src/gen/khortytsia/kurin-c/index.ts';
import pokrova from '../../../assets-src/gen/khortytsia/pokrova/index.ts';
import tower from '../../../assets-src/gen/khortytsia/tower/index.ts';
import treasury from '../../../assets-src/gen/khortytsia/treasury/index.ts';
import wallTower from '../../../assets-src/gen/khortytsia/wall-tower/index.ts';
import watchtower, { watchtowerBeacon } from '../../../assets-src/gen/khortytsia/watchtower/index.ts';
import { FIRE_LIGHTS } from '../../../src/render/atmosphere/config.ts';
import { loadPalette, type Palette } from '../../../assets-src/gen/lib/palette.ts';
import type { SpriteGenerator } from '../../../assets-src/gen/lib/types.ts';
import { FLAGPOLE_BANNER, GATE_BANNER } from '../../../src/content/villages/khortytsia.layout.ts';
import { renderGenerator, type FrameImage } from '../../../tools/lib/sprites/atlas.ts';
import { colorStats } from '../../../tools/lib/sprites/contact-sheet.ts';
import type { RgbaImage } from '../../../tools/lib/png.ts';

const palette: Palette = loadPalette(JSON.parse(readFileSync('assets-src/palettes/master.json', 'utf8')));
const BUDGET = { colors: 24, ramps: 6 } as const;
/**
 * Gate family exception (owner decision, M2-09): the M1 `gate` already uses 7 ramps — logs, roof, crimson band, gold,
 * iron, and the steppe + road seen through its open passage (grass, earth) — so `brama` may too, never more.
 */
const GATE_RAMPS = 7;

function bases(gen: SpriteGenerator): FrameImage[] {
  const problems: string[] = [];
  const frames = renderGenerator(gen, palette, problems).filter((f) => !f.name.includes('@'));
  expect(problems).toEqual([]);
  return frames;
}
const byName = (gen: SpriteGenerator, name: string): FrameImage => {
  const f = bases(gen).find((b) => b.name === `${name}/idle/00`);
  if (!f) throw new Error(`no frame ${name}`);
  return f;
};

function extent(image: RgbaImage): { w: number; h: number } {
  let [x0, y0, x1, y1] = [image.width, image.height, -1, -1];
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      if ((image.data[(y * image.width + x) * 4 + 3] ?? 0) === 0) continue;
      [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)];
    }
  }
  return { w: x1 - x0 + 1, h: y1 - y0 + 1 };
}
/** Opaque px aligned at the pivot. */
function mask(f: FrameImage): Set<string> {
  const px = Math.round(f.anchor.x * f.image.width);
  const py = Math.round(f.anchor.y * f.image.height);
  const out = new Set<string>();
  for (let y = 0; y < f.image.height; y++) {
    for (let x = 0; x < f.image.width; x++) {
      if ((f.image.data[(y * f.image.width + x) * 4 + 3] ?? 0) > 0) out.add(`${String(x - px)},${String(y - py)}`);
    }
  }
  return out;
}

describe('Sich bases stay inside the building colour budget (≤ 24 colours, ≤ 6 ramps; gate family ≤ 7)', () => {
  it.each([
    ['watchtower', watchtower, BUDGET.ramps],
    ['wall-tower', wallTower, BUDGET.ramps],
    ['pokrova', pokrova, BUDGET.ramps],
    ['treasury', treasury, BUDGET.ramps],
    ['kurin', kurin, BUDGET.ramps],
    ['kurin-b', kurinB, BUDGET.ramps],
    ['kurin-c', kurinC, BUDGET.ramps],
    ['koshovyi', koshovyi, BUDGET.ramps],
    ['kazan', kazan, BUDGET.ramps],
    ['flagpole', flagpole, BUDGET.ramps],
    ['banner', banner, BUDGET.ramps],
    ['gate', gate, GATE_RAMPS],
    ['brama', brama, GATE_RAMPS],
  ] as const)('%s', (_, gen, ramps) => {
    for (const f of bases(gen)) {
      const stats = colorStats(f.image, palette);
      expect(stats.colors, f.name).toBeLessThanOrEqual(BUDGET.colors);
      expect(stats.ramps.length, f.name).toBeLessThanOrEqual(ramps);
    }
  });
});

describe.each([
  ['watchtower', [byName(tower, 'tower'), ...['t2', 't3', 't4'].map((t) => byName(watchtower, `watchtower.${t}`))]],
  ['wall towers', [byName(tower, 'tower'), ...['t2', 't3', 't4'].map((t) => byName(wallTower, `wall-tower.${t}`))]],
  ['church', [byName(church, 'church'), ...['t2', 't3', 't4'].map((t) => byName(pokrova, `pokrova.${t}`))]],
  ['treasury', ['t1', 't2', 't3', 't4'].map((t) => byName(treasury, `treasury.${t}`))],
] as const)('%s tiers I–IV', (id, frames) => {
  it('never shrinks, and every tier changes the silhouette (≥ 12 px of the pivot-aligned mask)', () => {
    frames.slice(1).forEach((f, i) => {
      const prev = frames[i] ?? f;
      const [s, p] = [extent(f.image), extent(prev.image)];
      expect(s.w, `${id} ${f.name} width`).toBeGreaterThanOrEqual(p.w);
      expect(s.h, `${id} ${f.name} height`).toBeGreaterThanOrEqual(p.h);
      const [a, b] = [mask(f), mask(prev)];
      const differ = [...a].filter((k) => !b.has(k)).length + [...b].filter((k) => !a.has(k)).length;
      expect(differ, `${id} ${f.name} silhouette`).toBeGreaterThanOrEqual(12);
    });
  });
});

describe('корогва in the wind', () => {
  it('has 4 different wave frames of the same cloth', () => {
    const frames = bases(banner);
    expect(frames).toHaveLength(4);
    const keys = frames.map((f) => [...mask(f)].sort().join(';'));
    expect(new Set(keys).size).toBe(4);
    for (const f of frames) expect(extent(f.image).w).toBe(BANNER_CLOTH.w);
  });

  it('keeps the gold crossbar a straight 3-px row in every frame (one wave offset for the whole cross)', () => {
    const gold = palette.ramps.get('gold')?.[4];
    expect(gold).toBeDefined();
    for (const f of bases(banner)) {
      const { width, height, data } = f.image;
      const isGold = (x: number, y: number): boolean => {
        const i = (y * width + x) * 4;
        const rgb = ((data[i] ?? 0) << 16) | ((data[i + 1] ?? 0) << 8) | (data[i + 2] ?? 0);
        return (data[i + 3] ?? 0) > 0 && rgb === gold;
      };
      const bars = Array.from({ length: height }, (_, y) =>
        Array.from({ length: width - 2 }, (_, x) => isGold(x, y) && isGold(x + 1, y) && isGold(x + 2, y)).some(Boolean),
      ).filter(Boolean);
      expect(bars, f.name).toHaveLength(1);
    }
  });

  it('hangs at the hoist of the gate pole and the flagpole (layout offsets match the generators)', () => {
    const pivot = (f: FrameImage): { x: number; y: number } => ({
      x: Math.round(f.anchor.x * f.image.width),
      y: Math.round(f.anchor.y * f.image.height),
    });
    for (const [frame, hoist, at] of [
      [byName(brama, 'brama.t2'), BANNER_HOIST, GATE_BANNER],
      [byName(flagpole, 'flagpole'), FLAGPOLE_HOIST, FLAGPOLE_BANNER],
    ] as const) {
      const p = pivot(frame);
      expect({ dx: at.dx, lift: at.lift }, frame.name).toEqual({ dx: hoist.x - p.x, lift: p.y - hoist.y });
    }
  });
});

describe('watchtower beacon', () => {
  it('lights its warm pool round the basket of the generator (FIRE_LIGHTS dx/below)', () => {
    for (const t of ['t3', 't4'] as const) {
      const at = watchtowerBeacon(t);
      const light = FIRE_LIGHTS[`watchtower.${t}`];
      expect({ dx: light.dx, below: light.below }, t).toEqual({ dx: at.dx, below: at.dy });
    }
  });
});
