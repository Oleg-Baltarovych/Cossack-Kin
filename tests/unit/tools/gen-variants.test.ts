// Cosmetic plot variants (plan M2-10): the add-ons stay inside the prop colour budget (ART-BIBLE §4: ≤ 16 colours from
// ≤ 4 ramps), every option the content declares is drawn, and no add-on covers a building or any other prop at any
// tier — nor an add-on of another plot that can stand at the same time.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PLOT_VARIANTS, type VariantPlot } from '../../../src/content/variants.ts';
import { KHORTYTSIA_WORLD, type Prop } from '../../../src/content/villages/khortytsia.layout.ts';
import { loadPalette, type Palette } from '../../../assets-src/gen/lib/palette.ts';
import { renderGenerator, type FrameImage } from '../../../tools/lib/sprites/atlas.ts';
import { colorStats } from '../../../tools/lib/sprites/contact-sheet.ts';
import { loadGenerators } from '../../../tools/lib/sprites/load.ts';

const palette: Palette = loadPalette(JSON.parse(readFileSync('assets-src/palettes/master.json', 'utf8')));
/** The widest phone view in logical px (412-px project) plus a margin: two add-ons farther apart never share a screen. */
const PHONE_VIEW_PX = 420;
const PROP_BUDGET = { colors: 16, ramps: 4 } as const;
const ADD_ON_IDS = ['flowers', 'kennel', 'bench', 'laundry', 'woodpile', 'stork-nest', 'pumpkins', 'plough'];

const generators = await loadGenerators();
/** Base frame 00 of every non-debug generator, by stem (`flowers.a`). */
const FRAMES = new Map<string, FrameImage>(
  generators
    .filter((g) => g.atlas !== 'debug')
    .flatMap((g) => renderGenerator(g, palette, []))
    .filter((f) => !f.name.includes('@') && f.name.endsWith('/00'))
    .map((f) => [f.name.split('/')[0] ?? f.name, f]),
);

interface Rect {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

/** A prop's opaque box in world px (y down from the horizon), from its frame's alpha. */
function rectOf(p: Prop): Rect {
  const f = FRAMES.get(p.sprite);
  if (!f) throw new Error(`no frame ${p.sprite}`);
  const { width: w, height: h, data } = f.image;
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if ((data[(y * w + x) * 4 + 3] ?? 0) === 0) continue;
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
  }
  const left = p.x - Math.round(f.anchor.x * w);
  const top = p.ground - (p.lift ?? 0) - Math.round(f.anchor.y * h);
  return { x0: left + x0, y0: top + y0, x1: left + x1, y1: top + y1 };
}

const overlap = (a: Rect, b: Rect): boolean => a.x0 <= b.x1 && b.x0 <= a.x1 && a.y0 <= b.y1 && b.y0 <= a.y1;

const addOns = KHORTYTSIA_WORLD.props.filter((p) => p.plot?.variant !== undefined);
const others = KHORTYTSIA_WORLD.props.filter((p) => p.plot?.variant === undefined);
const plotOf = (p: Prop): string => p.plot?.building ?? '';

describe('plot variant add-ons (M2-10)', () => {
  it.each(ADD_ON_IDS)('%s stays inside the prop colour budget (≤ 16 colours, ≤ 4 ramps)', (id) => {
    const gen = generators.find((g) => g.id === id);
    expect(gen, id).toBeDefined();
    if (!gen) return;
    const problems: string[] = [];
    const frames = renderGenerator(gen, palette, problems).filter((f) => !f.name.includes('@'));
    expect(problems).toEqual([]);
    for (const f of frames) {
      const stats = colorStats(f.image, palette);
      expect(stats.colors, f.name).toBeLessThanOrEqual(PROP_BUDGET.colors);
      expect(stats.ramps.length, f.name).toBeLessThanOrEqual(PROP_BUDGET.ramps);
    }
  });

  it('draws every option of every variant plot, and nothing outside them', () => {
    const drawn = new Map<string, Set<number>>();
    for (const p of addOns) {
      const set = drawn.get(plotOf(p)) ?? new Set<number>();
      set.add(p.plot?.variant ?? -1);
      drawn.set(plotOf(p), set);
    }
    const want = Object.fromEntries(
      (Object.keys(PLOT_VARIANTS) as VariantPlot[]).map((b) => [
        b,
        Array.from({ length: PLOT_VARIANTS[b].options }, (_, i) => i),
      ]),
    );
    expect(Object.fromEntries([...drawn].map(([b, s]) => [b, [...s].sort()]))).toEqual(want);
  });

  it('covers no building or prop at any tier', () => {
    const hits = addOns.flatMap((a) =>
      others
        .filter((o) => overlap(rectOf(a), rectOf(o)))
        .map(
          (o) => `${a.sprite}@${String(a.x)} (${plotOf(a)} v${String(a.plot?.variant)}) × ${o.sprite}@${String(o.x)}`,
        ),
    );
    expect(hits).toEqual([]);
  });

  it('covers no add-on of another plot (any two plots can stand together)', () => {
    const hits = addOns.flatMap((a, i) =>
      addOns
        .slice(i + 1)
        .filter((b) => plotOf(a) !== plotOf(b) || a.plot?.variant === b.plot?.variant)
        .filter((b) => overlap(rectOf(a), rectOf(b)))
        .map((b) => `${a.sprite}@${String(a.x)} × ${b.sprite}@${String(b.x)}`),
    );
    expect(hits).toEqual([]);
  });

  // Big, eye-catching add-ons read as copy-paste when two plots show the same one on one screen (art-director M2-10:
  // two laundry lines; M2-29 B3: seed 1's fair and smithy carts).
  it.each(['laundry', 'cart'])('never shows two %s add-ons in one phone view', (sprite) => {
    const same = addOns.filter((p) => p.sprite === sprite);
    const close = same.flatMap((a, i) =>
      same
        .slice(i + 1)
        .filter((b) => plotOf(a) !== plotOf(b) && Math.abs(a.x - b.x) < PHONE_VIEW_PX)
        .map((b) => `${String(a.x)} × ${String(b.x)}`),
    );
    expect(close).toEqual([]);
  });
});
