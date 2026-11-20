// Paper-doll library and the ART-06 characters: masks paint the outfit's ramps, frames stand on their ground row,
// walk frames differ from each other (it is an animation, not one pose), palette swaps change only colours.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import kozak, { KOZAK_GROUND, KOZAK_OUTFITS } from '../../../assets-src/gen/people/kozak/index.ts';
import divchyna, { DIVCHYNA_OUTFITS } from '../../../assets-src/gen/people/divchyna/index.ts';
import selianka, { SELIANKA_GROUND, SELIANKA_OUTFITS } from '../../../assets-src/gen/people/selianka/index.ts';
import selianyn, { SELIANYN_OUTFITS } from '../../../assets-src/gen/people/selianyn/index.ts';
import { checkMask, paintDoll, type Outfit } from '../../../assets-src/gen/lib/doll.ts';
import { loadPalette, type Palette } from '../../../assets-src/gen/lib/palette.ts';
import { Plot } from '../../../assets-src/gen/lib/plot.ts';
import type { SpriteGenerator } from '../../../assets-src/gen/lib/types.ts';
import { renderGenerator, type FrameImage } from '../../../tools/lib/sprites/atlas.ts';
import { colorStats } from '../../../tools/lib/sprites/contact-sheet.ts';
import { VILLAGER_ANIMS, VILLAGER_SPRITES } from '../../../src/content/agents.ts';

const palette: Palette = loadPalette(JSON.parse(readFileSync('assets-src/palettes/master.json', 'utf8')));

const outfit: Outfit = {
  skin: { ramp: 'skin', tones: [1, 2, 3, 4] },
  hair: { ramp: 'wood', tones: [0, 1, 2, 3] },
  shirt: { ramp: 'plaster', tones: [2, 3, 5, 6] },
  lower: { ramp: 'cloth', tones: [0, 1, 2, 3] },
  accent: { ramp: 'crimson', tones: [1, 2, 3, 4] },
  belt: { ramp: 'crimson', tones: [1, 2, 3, 4] },
  boots: { ramp: 'crimson', tones: [0, 1, 2, 3] },
  hat: { ramp: 'ink', tones: [1, 2, 3, 3] },
};

describe('paper-doll masks', () => {
  it('paints each legend letter as its slot ramp at the tone (upper = light, pair letter = shade)', () => {
    const plot = new Plot();
    paintDoll(plot, outfit, [{ mask: ['sSzZ', 'p.q.'], x: 2, y: 3 }]);
    expect(plot.get(2, 3)).toEqual({ ramp: 'skin', shade: 3 });
    expect(plot.get(3, 3)).toEqual({ ramp: 'skin', shade: 4 });
    expect(plot.get(4, 3)).toEqual({ ramp: 'skin', shade: 2 });
    expect(plot.get(5, 3)).toEqual({ ramp: 'skin', shade: 1 });
    expect(plot.get(2, 4)).toEqual({ ramp: 'cloth', shade: 2 });
    expect(plot.has(3, 4)).toBe(false);
    expect(plot.get(4, 4)).toEqual({ ramp: 'cloth', shade: 1 });
  });

  it('later stamps cover earlier ones; unknown letters are rejected', () => {
    const plot = new Plot();
    paintDoll(plot, outfit, [
      { mask: ['ww'], x: 0, y: 0 },
      { mask: ['.r'], x: 0, y: 0 },
    ]);
    expect(plot.get(0, 0)?.ramp).toBe('plaster');
    expect(plot.get(1, 0)?.ramp).toBe('crimson');
    expect(() => {
      checkMask(['w?'], 'bad');
    }).toThrow(/unknown mask char "\?"/);
  });
});

function render(gen: SpriteGenerator): FrameImage[] {
  const problems: string[] = [];
  const frames = renderGenerator(gen, palette, problems);
  expect(problems).toEqual([]);
  return frames;
}
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

const VILLAGER_FRAMES = Object.fromEntries(Object.entries(VILLAGER_ANIMS).map(([k, v]) => [k, v.frames]));
const perVariant = (frames: Readonly<Record<string, number>>): number =>
  Object.values(frames).reduce((a, b) => a + b, 0);

describe.each([
  { gen: selianka, ground: SELIANKA_GROUND, frames: { idle: 4, walk: 6, ...VILLAGER_FRAMES } },
  { gen: kozak, ground: KOZAK_GROUND, frames: { idle: 4, walk: 6 } },
  { gen: divchyna, ground: SELIANKA_GROUND, frames: { idle: 4, walk: 6 } },
  { gen: selianyn, ground: KOZAK_GROUND, frames: { idle: 4, walk: 6, ...VILLAGER_FRAMES } },
])('$gen.id (ART-06, ART-15, M2-17)', ({ gen, ground, frames: declared }) => {
  const frames = render(gen);
  const base = frames.filter((f) => !f.name.includes('@'));

  it('declares idle 4 and walk 6 frames per variant (+ the villager set), each with a ground shadow', () => {
    expect(gen.frames).toEqual(declared);
    expect(base.length).toBe((gen.variants?.length ?? 1) * perVariant(declared));
    expect(frames.filter((f) => f.name.includes('@shadow')).length).toBe(base.length);
  });

  it('every frame stands on its ground row (the soles are the pivot)', () => {
    for (const f of base) expect(lowestRow(f), f.name).toBe(ground);
  });

  it('walk frames are distinct poses; variants share the silhouette and differ in colour', () => {
    const walk = base.filter((f) => f.name.startsWith(`${gen.id}.a/walk/`));
    expect(new Set(walk.map(key)).size).toBeGreaterThanOrEqual(4);
    const a = base.find((f) => f.name === `${gen.id}.a/idle/00`);
    const b = base.find((f) => f.name === `${gen.id}.b/idle/00`);
    if (!a || !b) throw new Error('missing variant frames');
    expect(alphaKey(a)).toBe(alphaKey(b));
    expect(key(a)).not.toBe(key(b));
  });
});

describe('the five villagers (ART-15) differ in silhouette, not only in clothes', () => {
  const idle = (gen: SpriteGenerator, variant: string): FrameImage => {
    const f = render(gen).find((x) => x.name === `${gen.id}.${variant}/idle/00`);
    if (!f) throw new Error(`no ${gen.id}.${variant}/idle/00`);
    return f;
  };
  it('woman in a kerchief, girl with a wreath, farmer in a свита, Cossack with оселедець, Cossack in a шапка', () => {
    const shapes = [
      idle(selianka, 'a'),
      idle(divchyna, 'a'),
      idle(selianyn, 'a'),
      idle(kozak, 'c'),
      idle(kozak, 'a'),
    ].map(alphaKey);
    expect(new Set(shapes).size).toBe(5);
  });
});

describe('villager work set (M2-17): two bodies, four outfits, every animation a readable pose', () => {
  const bodies = [selianka, selianyn];
  const all = bodies.flatMap(render);
  const byName = new Map(all.map((f) => [f.name, f]));
  const get = (name: string): FrameImage => {
    const f = byName.get(name);
    if (!f) throw new Error(`no frame ${name}`);
    return f;
  };
  const nn = (i: number): string => String(i).padStart(2, '0');

  it('every villager sprite has every animation the FSM may pick (content table = generator frames)', () => {
    for (const stem of VILLAGER_SPRITES) {
      const [entity = '', variant = ''] = stem.split('.');
      for (const [anim, { frames }] of Object.entries(VILLAGER_ANIMS)) {
        for (let i = 0; i < frames; i++) {
          expect(byName.has(`${stem}/${anim}/${nn(i)}`), `${stem}/${anim}/${nn(i)}`).toBe(true);
          expect(byName.has(`${entity}.${variant}@shadow/${anim}/${nn(i)}`)).toBe(true);
        }
      }
    }
  });

  it('frame rates follow SPEC §6.4 (work 4–6 @8, talk 2 @4, sit 2 @2, cheer 4 @10)', () => {
    for (const [anim, { frames, fps }] of Object.entries(VILLAGER_ANIMS)) {
      if (!anim.startsWith('work-')) continue;
      expect(frames, anim).toBeGreaterThanOrEqual(4);
      expect(frames, anim).toBeLessThanOrEqual(6);
      expect(fps, anim).toBe(8);
    }
    expect(VILLAGER_ANIMS.talk).toEqual({ frames: 2, fps: 4 });
    expect(VILLAGER_ANIMS.sit).toEqual({ frames: 2, fps: 2 });
    expect(VILLAGER_ANIMS.cheer).toEqual({ frames: 4, fps: 10 });
  });

  it.each(['selianka', 'selianyn'])(
    '%s: each animation has its own silhouette (frame 0 differs from idle and from every other one)',
    (id) => {
      const shapes = ['idle', ...Object.keys(VILLAGER_ANIMS)].map((anim) => alphaKey(get(`${id}.a/${anim}/00`)));
      expect(new Set(shapes).size).toBe(shapes.length);
    },
  );

  it('animations move: no two consecutive frames are identical', () => {
    for (const id of ['selianka', 'selianyn'])
      for (const [anim, { frames }] of Object.entries(VILLAGER_ANIMS))
        for (let i = 0; i < frames; i++) {
          const a = get(`${id}.a/${anim}/${nn(i)}`);
          const b = get(`${id}.a/${anim}/${nn((i + 1) % frames)}`);
          expect(key(a), `${id} ${anim} ${String(i)}`).not.toBe(key(b));
        }
  });

  it('the man and the woman work differently at the field and the smithy (scythe / sickle, anvil / bellows)', () => {
    for (const anim of ['work-field', 'work-smithy']) {
      expect(alphaKey(get(`selianka.a/${anim}/00`))).not.toBe(alphaKey(get(`selianyn.a/${anim}/00`)));
    }
  });

  it('outfits are palette swaps: same silhouette, different colours, in every animation', () => {
    for (const id of ['selianka', 'selianyn'])
      for (const anim of Object.keys(VILLAGER_ANIMS)) {
        const a = get(`${id}.a/${anim}/00`);
        for (const v of ['b', 'c', 'd']) {
          const o = get(`${id}.${v}/${anim}/00`);
          expect(alphaKey(o), `${id}.${v} ${anim}`).toBe(alphaKey(a));
          expect(key(o), `${id}.${v} ${anim}`).not.toBe(key(a));
        }
      }
  });

  /** Palette colours a frame uses (opaque px). */
  const colours = (f: FrameImage): Set<number> => {
    const out = new Set<number>();
    for (let i = 0; i < f.image.data.length; i += 4)
      if ((f.image.data[i + 3] ?? 0) > 0)
        out.add(((f.image.data[i] ?? 0) << 16) | ((f.image.data[i + 1] ?? 0) << 8) | (f.image.data[i + 2] ?? 0));
    return out;
  };

  it('people budget (ART-BIBLE §4): ≤ 6 ramps in every frame; a new outfit is no richer than the approved ones', () => {
    for (const f of all.filter((x) => !x.name.includes('@'))) {
      expect(colorStats(f.image, palette).ramps.length, f.name).toBeLessThanOrEqual(6);
      // The ART-15 villagers were approved at up to 28 colours in a walk frame (selianyn.a); "~24" is the target.
      if (/\/(idle|walk)\//.test(f.name)) expect(colours(f).size, f.name).toBeLessThanOrEqual(28);
    }
  });

  /** Work frames: the person plus tools and props (anvil, wheel, pail, bellows) — the people budget's hard cap. */
  const WORK_FRAME_COLOURS = 32;
  /** Shades a work frame may add over the same outfit standing still (steel, light wood, clay, sparks). */
  const TOOL_COLOURS = 6;

  it(`a work frame stays ≤ ${String(WORK_FRAME_COLOURS)} colours and adds ≤ ${String(TOOL_COLOURS)} over its outfit's idle frame`, () => {
    for (const stem of VILLAGER_SPRITES) {
      const still = colours(get(`${stem}/idle/00`));
      for (const [anim, { frames }] of Object.entries(VILLAGER_ANIMS)) {
        for (let i = 0; i < frames; i++) {
          const f = get(`${stem}/${anim}/${nn(i)}`);
          const own = colours(f);
          expect(own.size, f.name).toBeLessThanOrEqual(WORK_FRAME_COLOURS);
          expect([...own].filter((c) => !still.has(c)).length, f.name).toBeLessThanOrEqual(TOOL_COLOURS);
        }
      }
    }
  });

  it('the canvas is padded evenly to 32 px, so the pivot stays a whole px on the body', () => {
    for (const gen of bodies) {
      expect(gen.size.w).toBe(32);
      expect((gen.anchor?.x ?? 0.5) * gen.size.w).toBe(16);
    }
  });
});

describe('no state symbols in costumes (SPEC §16, art-director ART-19)', () => {
  it('no outfit stacks white shirt / blue belt / red trousers (reads as the Russian tricolour at phone size)', () => {
    const all = {
      ...Object.fromEntries(Object.entries(KOZAK_OUTFITS).map(([k, v]) => [`kozak.${k}`, v])),
      ...Object.fromEntries(Object.entries(SELIANKA_OUTFITS).map(([k, v]) => [`selianka.${k}`, v])),
      ...Object.fromEntries(Object.entries(DIVCHYNA_OUTFITS).map(([k, v]) => [`divchyna.${k}`, v])),
      ...Object.fromEntries(Object.entries(SELIANYN_OUTFITS).map(([k, v]) => [`selianyn.${k}`, v])),
    };
    for (const [name, o] of Object.entries(all)) {
      const tricolour = o.shirt.ramp === 'plaster' && o.belt.ramp === 'cloth' && o.lower.ramp === 'crimson';
      expect(tricolour, name).toBe(false);
    }
  });

  /** Colour family of a ramp as it reads at phone size. */
  const FAMILY: Readonly<Record<string, string>> = {
    plaster: 'white',
    cloth: 'blue',
    water: 'blue',
    sky: 'pink',
    crimson: 'red',
    gold: 'yellow',
    thatch: 'yellow',
    grass: 'green',
    foliage: 'green',
    earth: 'brown',
    wood: 'brown',
    stone: 'grey',
    ink: 'black',
    skin: 'skin',
  };
  /** Top-to-bottom bands of a figure: head cover, shirt / coat, belt, skirt / trousers (equal neighbours merged). */
  const bands = (o: Outfit): string[] =>
    [o.hat, o.shirt, o.belt, o.lower]
      .map((s) => FAMILY[s.ramp] ?? s.ramp)
      .filter((f, i, list) => i === 0 || list[i - 1] !== f);
  const FLAGS: readonly (readonly string[])[] = [
    ['white', 'blue', 'red'],
    ['blue', 'yellow'],
  ];
  const contains = (list: readonly string[], run: readonly string[]): boolean =>
    list.some((_, i) => run.every((c, k) => list[i + k] === c));
  const everyone = (): [string, Outfit][] => [
    ...Object.entries(KOZAK_OUTFITS).map(([k, v]): [string, Outfit] => [`kozak.${k}`, v]),
    ...Object.entries(SELIANKA_OUTFITS).map(([k, v]): [string, Outfit] => [`selianka.${k}`, v]),
    ...Object.entries(DIVCHYNA_OUTFITS).map(([k, v]): [string, Outfit] => [`divchyna.${k}`, v]),
    ...Object.entries(SELIANYN_OUTFITS).map(([k, v]): [string, Outfit] => [`selianyn.${k}`, v]),
  ];

  it('the band check reads a figure top to bottom (kerchief, shirt, belt, skirt)', () => {
    expect(bands({ ...outfit, hat: { ramp: 'crimson', tones: [1, 2, 3, 4] } })).toEqual([
      'red',
      'white',
      'red',
      'blue',
    ]);
    expect(
      contains(
        bands({
          ...outfit,
          belt: { ramp: 'cloth', tones: [0, 1, 2, 3] },
          lower: { ramp: 'crimson', tones: [1, 2, 3, 4] },
        }),
        ['white', 'blue', 'red'],
      ),
    ).toBe(true);
  });

  it('no outfit stacks the Russian (white / blue / red) or the Ukrainian state flag (blue over yellow) top to bottom', () => {
    for (const [name, o] of everyone())
      for (const flag of FLAGS) expect(contains(bands(o), flag), `${name} ${flag.join('/')}`).toBe(false);
  });

  it('clothes are period dyes only: linen, indigo, madder, ochre / straw, green, browns, greys — no sky or water tints', () => {
    const DYES = new Set(['plaster', 'cloth', 'crimson', 'gold', 'thatch', 'grass', 'earth', 'wood', 'stone']);
    for (const [name, o] of everyone()) {
      expect(o.skin.ramp, name).toBe('skin');
      for (const slot of ['shirt', 'lower', 'accent', 'belt', 'boots', 'hat'] as const)
        expect(DYES.has(o[slot].ramp), `${name}.${slot} ${o[slot].ramp}`).toBe(true);
    }
  });

  it('there are 4–6 villager outfits per body (SPEC §6.4)', () => {
    for (const set of [SELIANKA_OUTFITS, SELIANYN_OUTFITS]) {
      expect(Object.keys(set).length).toBeGreaterThanOrEqual(4);
      expect(Object.keys(set).length).toBeLessThanOrEqual(6);
    }
  });
});
