// The visitors' sprites (plan M2-21): five travellers on the man's paper doll, each with walk 6@10 / idle 4@6 (+ the
// кобзар's play 4@6), standing on the ground row, within the people budget (≤ 6 ramps, ≤ 32 colours), period dyes
// only, no state flag top to bottom, and each with his own silhouette (props), unlike the villagers.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import chumak, { CHUMAK_OUTFIT } from '../../../assets-src/gen/people/chumak/index.ts';
import hanchar, { HANCHAR_OUTFIT } from '../../../assets-src/gen/people/hanchar/index.ts';
import kobzar, { KOBZAR_OUTFIT } from '../../../assets-src/gen/people/kobzar/index.ts';
import korobeinyk, { KOROBEINYK_OUTFIT } from '../../../assets-src/gen/people/korobeinyk/index.ts';
import lirnyk, { LIRNYK_OUTFIT } from '../../../assets-src/gen/people/lirnyk/index.ts';
import selianyn from '../../../assets-src/gen/people/selianyn/index.ts';
import kozak from '../../../assets-src/gen/people/kozak/index.ts';
import { VISITOR_GROUND } from '../../../assets-src/gen/people/visitor.ts';
import type { Outfit } from '../../../assets-src/gen/lib/doll.ts';
import { loadPalette, type Palette } from '../../../assets-src/gen/lib/palette.ts';
import type { SpriteGenerator } from '../../../assets-src/gen/lib/types.ts';
import { renderGenerator, type FrameImage } from '../../../tools/lib/sprites/atlas.ts';
import { colorStats } from '../../../tools/lib/sprites/contact-sheet.ts';
import { KOBZAR_ANIMS, VISITOR_SPRITES } from '../../../src/content/agents.ts';
import { IDLE_FPS, IDLE_FRAMES, WALK_FPS, WALK_FRAMES, personAnim } from '../../../src/render/agents/sim.ts';

const palette: Palette = loadPalette(JSON.parse(readFileSync('assets-src/palettes/master.json', 'utf8')));
const GENS: readonly SpriteGenerator[] = [kobzar, lirnyk, chumak, korobeinyk, hanchar];
const OUTFITS: Readonly<Record<string, Outfit>> = {
  kobzar: KOBZAR_OUTFIT,
  lirnyk: LIRNYK_OUTFIT,
  chumak: CHUMAK_OUTFIT,
  korobeinyk: KOROBEINYK_OUTFIT,
  hanchar: HANCHAR_OUTFIT,
};

function render(gen: SpriteGenerator): FrameImage[] {
  const problems: string[] = [];
  const frames = renderGenerator(gen, palette, problems);
  expect(problems, gen.id).toEqual([]);
  return frames;
}
const ALL = new Map(GENS.map((g) => [g.id, render(g)]));
const get = (name: string): FrameImage => {
  const f = [...ALL.values(), render(selianyn), render(kozak)].flat().find((x) => x.name === name);
  if (!f) throw new Error(`no frame ${name}`);
  return f;
};
const lowestRow = (f: FrameImage): number => {
  let low = -1;
  for (let i = 3; i < f.image.data.length; i += 4)
    if ((f.image.data[i] ?? 0) > 0) low = Math.floor(i / 4 / f.image.width);
  return low;
};
const key = (f: FrameImage): string => Buffer.from(f.image.data).toString('base64');
const alphaKey = (f: FrameImage): string =>
  Array.from(
    f.image.data.filter((_, i) => i % 4 === 3),
    (a) => (a > 0 ? 1 : 0),
  ).join('');
function colours(f: FrameImage): Set<string> {
  const out = new Set<string>();
  const d = f.image.data;
  for (let i = 0; i < d.length; i += 4)
    if ((d[i + 3] ?? 0) > 0) out.add(`${String(d[i])},${String(d[i + 1])},${String(d[i + 2])}`);
  return out;
}

describe('visitor sprites (M2-21)', () => {
  it('every visitor sprite of the content is a generator with walk, idle (+ play for the кобзар) and shadows', () => {
    expect(GENS.map((g) => `${g.id}.a`).sort()).toEqual(Object.values(VISITOR_SPRITES).sort());
    for (const g of GENS) {
      const expected = { idle: IDLE_FRAMES, walk: WALK_FRAMES, ...(g.id === 'kobzar' ? { play: 4 } : {}) };
      expect(g.frames, g.id).toEqual(expected);
      const frames = ALL.get(g.id) ?? [];
      const base = frames.filter((f) => !f.name.includes('@'));
      expect(frames.filter((f) => f.name.includes('@shadow')).length, g.id).toBe(base.length);
    }
    expect(personAnim('play')).toEqual(KOBZAR_ANIMS.play);
    expect(KOBZAR_ANIMS.play).toEqual({ frames: 4, fps: 6 });
    expect([WALK_FPS, IDLE_FPS]).toEqual([10, 6]);
  });

  it('every frame stands on the ground row; walk and play move frame to frame', () => {
    for (const [id, frames] of ALL) {
      for (const f of frames.filter((x) => !x.name.includes('@'))) expect(lowestRow(f), f.name).toBe(VISITOR_GROUND);
      const walk = frames.filter((f) => f.name.startsWith(`${id}.a/walk/`));
      expect(new Set(walk.map(key)).size, id).toBeGreaterThanOrEqual(4);
    }
    const play = (ALL.get('kobzar') ?? []).filter((f) => f.name.startsWith('kobzar.a/play/'));
    expect(play).toHaveLength(4);
    const keys = play.map(key);
    for (let i = 0; i < 4; i++) expect(keys[i], String(i)).not.toBe(keys[(i + 1) % 4]);
  });

  it('people budget (ART-BIBLE §4): ≤ 6 ramps and ≤ 32 colours a frame', () => {
    for (const frames of ALL.values())
      for (const f of frames.filter((x) => !x.name.includes('@'))) {
        expect(colorStats(f.image, palette).ramps.length, f.name).toBeLessThanOrEqual(6);
        expect(colours(f).size, f.name).toBeLessThanOrEqual(32);
      }
  });

  it('each has his own silhouette — and none is a villager or a Cossack', () => {
    const shapes = [...GENS.map((g) => get(`${g.id}.a/idle/00`)), get('selianyn.a/idle/00'), get('kozak.a/idle/00')];
    expect(new Set(shapes.map(alphaKey)).size).toBe(shapes.length);
  });

  it('the canvas is padded evenly to 32 px, so the pivot stays a whole px on the body', () => {
    for (const g of GENS) {
      expect(g.size.w, g.id).toBe(32);
      expect((g.anchor?.x ?? 0.5) * g.size.w, g.id).toBe(16);
    }
  });
});

describe('visitor costumes (SPEC §16)', () => {
  const FAMILY: Readonly<Record<string, string>> = {
    plaster: 'white',
    cloth: 'blue',
    crimson: 'red',
    gold: 'yellow',
    thatch: 'yellow',
    grass: 'green',
    earth: 'brown',
    wood: 'brown',
    stone: 'grey',
  };
  const bands = (o: Outfit): string[] =>
    [o.hat, o.shirt, o.belt, o.lower]
      .map((s) => FAMILY[s.ramp] ?? s.ramp)
      .filter((f, i, list) => i === 0 || list[i - 1] !== f);
  const contains = (list: readonly string[], run: readonly string[]): boolean =>
    list.some((_, i) => run.every((c, k) => list[i + k] === c));

  it('period dyes only, and no white / blue / red or blue over yellow top to bottom', () => {
    const DYES = new Set(['plaster', 'cloth', 'crimson', 'gold', 'thatch', 'grass', 'earth', 'wood', 'stone']);
    for (const [id, o] of Object.entries(OUTFITS)) {
      expect(o.skin.ramp, id).toBe('skin');
      for (const slot of ['shirt', 'lower', 'accent', 'belt', 'boots', 'hat'] as const)
        expect(DYES.has(o[slot].ramp), `${id}.${slot}`).toBe(true);
      for (const flag of [
        ['white', 'blue', 'red'],
        ['blue', 'yellow'],
      ])
        expect(contains(bands(o), flag), `${id} ${flag.join('/')}`).toBe(false);
    }
  });
});
