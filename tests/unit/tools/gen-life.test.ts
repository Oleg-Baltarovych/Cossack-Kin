// Building life (plan M2-11): every smoke vent in the world sits on a chimney's mouth of the frame it belongs to
// (an opaque px with open air above it, tier by tier); the pennants hang at the hoists the generators draw; the boats
// float inside the river's rows.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BOAT_PIER } from '../../../assets-src/gen/khortytsia/boat/index.ts';
import { fairPennant } from '../../../assets-src/gen/khortytsia/fair/index.ts';
import { STALL_PENNANT } from '../../../assets-src/gen/khortytsia/stall/index.ts';
import { loadPalette } from '../../../assets-src/gen/lib/palette.ts';
import type { SpriteGenerator } from '../../../assets-src/gen/lib/types.ts';
import {
  FAIR_PENNANT,
  isTierSprite,
  KHORTYTSIA_SUBURB,
  KHORTYTSIA_WORLD,
} from '../../../src/content/villages/khortytsia.layout.ts';
import { riverRowEnd } from '../../../src/render/zones.ts';
import { renderGenerator, type FrameImage } from '../../../tools/lib/sprites/atlas.ts';

const palette = loadPalette(JSON.parse(readFileSync('assets-src/palettes/master.json', 'utf8')));

/** The base frame `<sprite>/idle/00` rendered by its generator (`khata.t3` → generator `khata`). */
async function baseFrame(sprite: string): Promise<FrameImage> {
  const id = sprite.split('.')[0] ?? sprite;
  const gen = ((await import(`../../../assets-src/gen/khortytsia/${id}/index.ts`)) as { default: SpriteGenerator })
    .default;
  const problems: string[] = [];
  const frame = renderGenerator(gen, palette, problems).find((f) => f.name === `${sprite}/idle/00`);
  expect(problems).toEqual([]);
  if (!frame) throw new Error(`no frame ${sprite}/idle/00`);
  return frame;
}

const alpha = (f: FrameImage, x: number, y: number): number => f.image.data[(y * f.image.width + x) * 4 + 3] ?? 0;

describe('chimney smoke vents', () => {
  const vents = KHORTYTSIA_WORLD.props.filter((p) => p.smoke);

  it('every chimney-bearing tier has a vent: potter II–VI, tavern III–VI, smithy II–VI, kurin-c, koshovyi', () => {
    const sprites = new Set(vents.map((p) => p.sprite));
    for (const s of ['potter.t2', 'khata.t3', 'potter.t4', 'potter.t5', 'potter.t6', 'kurin-c', 'koshovyi'])
      expect(sprites, s).toContain(s);
    for (const t of [3, 4, 5, 6]) expect(sprites).toContain(`tavern.t${String(t)}`);
    for (const t of [2, 3, 4, 5, 6]) expect(sprites).toContain(`smithy.t${String(t)}`);
  });

  it('sits on an opaque chimney top with open air above it, in the frame of its own tier', async () => {
    for (const prop of vents) {
      const f = await baseFrame(prop.sprite);
      const vent = prop.smoke;
      if (!vent) continue;
      const px = Math.round(f.anchor.x * f.image.width) + vent.dx;
      const row = Math.round(f.anchor.y * f.image.height) - vent.lift;
      expect(alpha(f, px, row), `${prop.sprite}: mouth px`).toBe(255);
      for (let y = 0; y < row; y++) expect(alpha(f, px, y), `${prop.sprite}: open air at row ${String(y)}`).toBe(0);
    }
  });
});

describe('pennants', () => {
  const fair = KHORTYTSIA_SUBURB.props.filter(isTierSprite).find((t) => t.building === 'fair');
  const partsAt = (tier: number) => {
    const look = fair?.tiers[tier - 1];
    return look && 'parts' in look ? look.parts : [];
  };

  it("the fair's crimson pennant hangs at the generator's pole hoist (V–VI only)", () => {
    expect(FAIR_PENNANT).toEqual({ t5: fairPennant('t5'), t6: fairPennant('t6') });
    for (const tier of [1, 2, 3, 4]) {
      expect(fairPennant(`t${String(tier)}`)).toBeNull();
      expect(partsAt(tier).some((p) => p.sprite === 'pennant.a')).toBe(false);
    }
    for (const tier of [5, 6] as const) {
      const p = partsAt(tier).find((q) => q.sprite === 'pennant.a');
      const want = fairPennant(`t${String(tier)}`);
      expect([p?.dx, p?.lift, p?.dground ?? 0]).toEqual([want?.dx, want?.lift, 0]);
    }
  });

  it("stall a's green pennant hangs at its pole's hoist on every tier", () => {
    for (const tier of [1, 2, 3, 4, 5, 6]) {
      const parts = partsAt(tier);
      const stall = parts.find((p) => p.sprite === 'stall.a');
      const flag = parts.find((p) => p.sprite === 'pennant.b');
      expect([flag?.dx, flag?.dground, flag?.lift], `t${String(tier)}`).toEqual([
        (stall?.dx ?? 0) + STALL_PENNANT.dx,
        stall?.dground,
        STALL_PENNANT.lift,
      ]);
    }
  });

  it('flies in the wind: 4 frames at the wind rate (4 longer in a storm), no ground shadow', () => {
    for (const p of KHORTYTSIA_WORLD.props.filter((q) => q.sprite.startsWith('pennant.'))) {
      expect(p.animate).toEqual({ kind: 'cycle', frames: 4, fps: 'wind', gale: true });
      expect(p.shadow).toBe(false);
    }
  });
});

describe('boats', () => {
  it('two boats float inside the river: the waterline row and the ripples (with the drift) are water', async () => {
    const river = KHORTYTSIA_WORLD.river;
    expect(KHORTYTSIA_WORLD.boats).toHaveLength(2);
    if (!river) throw new Error('no river');
    // The ripple frame's opaque reach either side of its pivot, read off the generated frame.
    const ripple = await baseFrame('ripple.day');
    const pivot = Math.round(ripple.anchor.x * ripple.image.width);
    let left = pivot;
    let right = 0;
    for (let y = 0; y < ripple.image.height; y++) {
      for (let x = 0; x < ripple.image.width; x++) {
        if (alpha(ripple, x, y) === 0) continue;
        left = Math.max(left, pivot - x);
        right = Math.max(right, x + 1 - pivot);
      }
    }
    expect(left).toBeGreaterThan(0);
    for (const boat of KHORTYTSIA_WORLD.boats) {
      const row = boat.ground - 1;
      expect(row).toBeGreaterThanOrEqual(0);
      expect(row).toBeLessThan(river.rows);
      expect(boat.x - left - boat.drift).toBeGreaterThanOrEqual(river.x0);
      expect(boat.x + right + boat.drift).toBeLessThanOrEqual(riverRowEnd(river, row));
    }
  });

  // M2-29 B3: the plank walk (кладка) the boat is tied to runs from the shore out into the water past its bow.
  it("the moored boat's plank walk rests on the shore and reaches out over the water", () => {
    const moored = KHORTYTSIA_WORLD.boats.find((b) => b.sprite === 'boat.a');
    const river = KHORTYTSIA_WORLD.river;
    if (!moored || !river) throw new Error('no moored boat or river');
    expect(moored.drift).toBe(0);
    // The waterline row is ground − 1.
    const waterline = moored.ground - 1;
    expect(waterline - BOAT_PIER.far).toBeGreaterThanOrEqual(0);
    expect(waterline + BOAT_PIER.foot).toBeGreaterThanOrEqual(river.rows);
    // Every deck row in the river is water across the walk's width.
    for (let row = waterline - BOAT_PIER.far; row < river.rows; row++) {
      expect(moored.x + BOAT_PIER.dx1, `row ${String(row)}`).toBeLessThan(riverRowEnd(river, row));
    }
  });
});
