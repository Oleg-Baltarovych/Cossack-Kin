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
import otaman, { OTAMAN_GROUND, OTAMAN_OUTFIT } from '../../../assets-src/gen/people/otaman/index.ts';
import vartovyi, { VARTOVYI_GROUND, VARTOVYI_OUTFITS } from '../../../assets-src/gen/people/vartovyi/index.ts';
import khorunzhyi, {
  bearerHoist,
  KHORUNZHYI_GROUND,
  KHORUNZHYI_OUTFIT,
} from '../../../assets-src/gen/people/khorunzhyi/index.ts';
import nosii, { REAR_OUTFIT } from '../../../assets-src/gen/people/nosii/index.ts';
import korohva, { inNotch } from '../../../assets-src/gen/people/korohva/index.ts';
import skrynia, { CHEST } from '../../../assets-src/gen/people/skrynia/index.ts';
import banner, { BANNER_CLOTH, BANNER_PAD, bannerOffset } from '../../../assets-src/gen/khortytsia/banner/index.ts';
import {
  COSSACK_ANIMS,
  GUARD_ANIMS,
  KOZAK_SPRITES,
  GUARD_SPRITES,
  BEARER_BANNER,
  OTAMAN_ANIMS,
  RAID_ANIMS,
  RAID_SPRITES,
  VILLAGER_ANIMS,
  VILLAGER_SPRITES,
} from '../../../src/content/agents.ts';

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

function framesOf(t: Readonly<Record<string, { readonly frames: number }>>): Record<string, number> {
  return Object.fromEntries(Object.entries(t).map(([k, v]) => [k, v.frames]));
}
const VILLAGER_FRAMES = Object.fromEntries(Object.entries(VILLAGER_ANIMS).map(([k, v]) => [k, v.frames]));
const perVariant = (frames: Readonly<Record<string, number>>): number =>
  Object.values(frames).reduce((a, b) => a + b, 0);

describe.each([
  { gen: selianka, ground: SELIANKA_GROUND, frames: { idle: 4, walk: 6, ...VILLAGER_FRAMES } },
  { gen: kozak, ground: KOZAK_GROUND, frames: { idle: 4, walk: 6, ...framesOf(COSSACK_ANIMS) } },
  { gen: vartovyi, ground: VARTOVYI_GROUND, frames: { idle: 4, walk: 6, ...framesOf(GUARD_ANIMS) } },
  { gen: divchyna, ground: SELIANKA_GROUND, frames: { idle: 4, walk: 6 } },
  { gen: selianyn, ground: KOZAK_GROUND, frames: { idle: 4, walk: 6, ...VILLAGER_FRAMES } },
])('$gen.id (ART-06, ART-15, M2-17)', ({ gen, ground, frames: declared }) => {
  const frames = render(gen);
  const base = frames.filter((f) => !f.name.includes('@'));

  it('declares idle 4 and walk 6 frames per variant (+ the villager set), each with a ground shadow', () => {
    expect(gen.frames).toEqual(declared);
    expect(base.length).toBe((gen.variants?.length ?? 1) * perVariant(declared));
    expect(frames.filter((f) => f.name.includes('@shadow')).length).toBe(base.length);
    if (gen.layers?.includes('emissive'))
      expect(frames.filter((f) => f.name.includes('@emissive')).length).toBe(base.length);
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
    ...Object.entries(VARTOVYI_OUTFITS).map(([k, v]): [string, Outfit] => [`vartovyi.${k}`, v]),
    ['otaman.a', OTAMAN_OUTFIT],
    ['khorunzhyi.a', KHORUNZHYI_OUTFIT],
    ['nosii.a (rear)', REAR_OUTFIT],
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

describe('the Sich set (M2-19): drill, pipe and cheer; the otaman; the guards with torches', () => {
  const all = [kozak, otaman, vartovyi].flatMap(render);
  const byName = new Map(all.map((f) => [f.name, f]));
  const get = (name: string): FrameImage => {
    const f = byName.get(name);
    if (!f) throw new Error(`no frame ${name}`);
    return f;
  };
  const nn = (i: number): string => String(i).padStart(2, '0');
  const colours = (f: FrameImage): Set<number> => {
    const out = new Set<number>();
    for (let i = 0; i < f.image.data.length; i += 4)
      if ((f.image.data[i + 3] ?? 0) > 0)
        out.add(((f.image.data[i] ?? 0) << 16) | ((f.image.data[i + 1] ?? 0) << 8) | (f.image.data[i + 2] ?? 0));
    return out;
  };
  const opaque = (f: FrameImage): number =>
    alphaKey(f)
      .split('')
      .filter((c) => c === '1').length;
  const families = [
    { stems: KOZAK_SPRITES, anims: COSSACK_ANIMS },
    { stems: ['otaman.a'], anims: OTAMAN_ANIMS },
    { stems: GUARD_SPRITES, anims: GUARD_ANIMS },
  ] as const;

  it('every Cossack sprite has the animations its routine may pick (content tables = generator frames, + shadow)', () => {
    for (const { stems, anims } of families)
      for (const stem of stems) {
        const [entity = '', variant = ''] = stem.split('.');
        for (const [anim, { frames }] of Object.entries(anims))
          for (let i = 0; i < frames; i++) {
            expect(byName.has(`${stem}/${anim}/${nn(i)}`), `${stem}/${anim}/${nn(i)}`).toBe(true);
            expect(byName.has(`${entity}.${variant}@shadow/${anim}/${nn(i)}`)).toBe(true);
          }
      }
    expect(otaman.frames).toEqual({ idle: 4, walk: 6, ...framesOf(OTAMAN_ANIMS) });
  });

  it('rates follow the plan (drill 4 @8, sit-smoke 2 @2, cheer as the villagers 4 @10; watch 2 @2, torch 4 @8)', () => {
    expect(COSSACK_ANIMS).toEqual({
      drill: { frames: 4, fps: 8 },
      'sit-smoke': { frames: 2, fps: 2 },
      cheer: VILLAGER_ANIMS.cheer,
      march: OTAMAN_ANIMS.march,
    });
    expect(GUARD_ANIMS).toEqual({ watch: { frames: 2, fps: 2 }, torch: { frames: 4, fps: 8 } });
  });

  it('each animation moves and has its own silhouette; outfits are palette swaps', () => {
    for (const { stems, anims } of families) {
      const stem = stems[0];
      const shapes = ['idle', ...Object.keys(anims)].map((a) => alphaKey(get(`${stem}/${a}/00`)));
      expect(new Set(shapes).size, stem).toBe(shapes.length);
      for (const [anim, { frames }] of Object.entries(anims))
        for (let i = 0; i < frames; i++)
          expect(key(get(`${stem}/${anim}/${nn(i)}`)), `${stem} ${anim} ${String(i)}`).not.toBe(
            key(get(`${stem}/${anim}/${nn((i + 1) % frames)}`)),
          );
      // Palette swaps of one head (the bare-headed kozak.c has his own silhouette, ART-15).
      const same = stems.slice(1).filter((o) => alphaKey(get(`${o}/idle/00`)) === alphaKey(get(`${stem}/idle/00`)));
      expect(same.length, stem).toBeGreaterThanOrEqual(stems.length > 1 ? 1 : 0);
      for (const other of same)
        for (const anim of Object.keys(anims)) {
          expect(alphaKey(get(`${other}/${anim}/00`)), `${other} ${anim}`).toBe(alphaKey(get(`${stem}/${anim}/00`)));
          expect(key(get(`${other}/${anim}/00`)), `${other} ${anim}`).not.toBe(key(get(`${stem}/${anim}/00`)));
        }
    }
  });

  it('people budget: ≤ 6 ramps (no more than the approved idle), ≤ 32 colours, an action adds ≤ 6 colours over its idle frame', () => {
    for (const f of all.filter((x) => !x.name.includes('@'))) {
      const stem = f.name.split('/')[0] ?? '';
      // kozak.b's idle was approved with 7 ramps (ART-06/19: the ochre sash, the blue шлик): no frame goes past it.
      const idleRamps = colorStats(get(`${stem}/idle/00`).image, palette).ramps.length;
      expect(colorStats(f.image, palette).ramps.length, f.name).toBeLessThanOrEqual(Math.max(6, idleRamps));
      expect(colours(f).size, f.name).toBeLessThanOrEqual(32);
      const still = colours(get(`${stem}/idle/00`));
      expect([...colours(f)].filter((c) => !still.has(c)).length, f.name).toBeLessThanOrEqual(6);
    }
  });

  it('the otaman is bigger than the rank and file (his own silhouette)', () => {
    const [o, k] = [get('otaman.a/idle/00'), get('kozak.a/idle/00')];
    expect(opaque(o)).toBeGreaterThan(opaque(k) * 1.2);
    expect(lowestRow(o)).toBe(OTAMAN_GROUND);
  });

  it('only the torch lights the night: an @emissive flame on every torch frame, nothing on the others', () => {
    for (const v of ['a', 'b'])
      for (const anim of ['idle', 'walk', 'watch', 'torch']) {
        const frames = anim === 'torch' ? 4 : anim === 'watch' ? 2 : anim === 'idle' ? 4 : 6;
        for (let i = 0; i < frames; i++) {
          const lit = opaque(get(`vartovyi.${v}@emissive/${anim}/${nn(i)}`));
          if (anim === 'torch') expect(lit, `${v} ${String(i)}`).toBeGreaterThanOrEqual(5);
          else expect(lit, `${v} ${anim}`).toBe(0);
        }
      }
  });

  it('canvases are padded evenly, so every pivot stays a whole px on the body', () => {
    for (const gen of [kozak, otaman, vartovyi]) {
      expect(gen.size.w, gen.id).toBe(32);
      expect((gen.anchor?.x ?? 0.5) * gen.size.w, gen.id).toBe(16);
    }
  });
});

describe('the raid set (M3-13): march, the корогвоносець, the chest and its carriers', () => {
  const raid = [kozak, khorunzhyi, nosii, korohva, skrynia].flatMap(render);
  const byName = new Map(raid.map((f) => [f.name, f]));
  const get = (name: string): FrameImage => {
    const f = byName.get(name);
    if (!f) throw new Error(`no frame ${name}`);
    return f;
  };
  const nn = (i: number): string => String(i).padStart(2, '0');
  const ramps = (f: FrameImage): number => colorStats(f.image, palette).ramps.length;

  it('the raid figures have idle + march (content RAID_ANIMS) with their shadows, and no walk', () => {
    for (const stem of RAID_SPRITES) {
      const [entity = '', variant = ''] = stem.split('.');
      for (const [anim, frames] of [
        ['idle', 4],
        ['march', RAID_ANIMS.march.frames],
      ] as const)
        for (let i = 0; i < frames; i++) {
          expect(byName.has(`${stem}/${anim}/${nn(i)}`), `${stem}/${anim}/${nn(i)}`).toBe(true);
          expect(byName.has(`${entity}.${variant}@shadow/${anim}/${nn(i)}`)).toBe(true);
        }
      expect(byName.has(`${stem}/walk/00`), stem).toBe(false);
    }
    expect(RAID_ANIMS.march).toEqual(OTAMAN_ANIMS.march);
  });

  it('march is its own gait: every frame moves, and it is not the walk with a musket painted over', () => {
    for (const v of ['a', 'b', 'c']) {
      const march = Array.from({ length: 6 }, (_, i) => get(`kozak.${v}/march/${nn(i)}`));
      march.forEach((f, i) => {
        expect(key(f), `${v} ${String(i)}`).not.toBe(key(march[(i + 1) % 6] ?? f));
        // Its own silhouette in every frame (the upright musket), not the walk's.
        const walk = get(`kozak.${v}/walk/${nn(i)}`);
        expect(alphaKey(f), `${v} ${String(i)}`).not.toBe(alphaKey(walk));
        const opaque = (img: FrameImage): number =>
          alphaKey(img)
            .split('')
            .filter((c) => c === '1').length;
        expect(opaque(f)).toBeGreaterThan(opaque(walk));
      });
    }
  });

  it('≤ 6 ramps a frame (kozak.b keeps its approved 7), every figure on its ground row', () => {
    for (const f of raid.filter((x) => !x.name.includes('@'))) {
      const limit = f.name.startsWith('kozak.b/') ? 7 : 6;
      expect(ramps(f), f.name).toBeLessThanOrEqual(limit);
    }
    for (const f of raid.filter((x) => /^(khorunzhyi|nosii)\.a\//.test(x.name)))
      expect(lowestRow(f), f.name).toBe(f.name.startsWith('khorunzhyi') ? KHORUNZHYI_GROUND : 27);
  });

  it('the march adds only its tools to a Cossack: ≤ 6 colours over his idle frame', () => {
    const colours = (f: FrameImage): Set<number> => {
      const out = new Set<number>();
      for (let i = 0; i < f.image.data.length; i += 4)
        if ((f.image.data[i + 3] ?? 0) > 0)
          out.add(((f.image.data[i] ?? 0) << 16) | ((f.image.data[i + 1] ?? 0) << 8) | (f.image.data[i + 2] ?? 0));
      return out;
    };
    for (const v of ['a', 'b', 'c']) {
      const still = colours(get(`kozak.${v}/idle/00`));
      for (let i = 0; i < 6; i++)
        expect([...colours(get(`kozak.${v}/march/${nn(i)}`))].filter((c) => !still.has(c)).length).toBeLessThanOrEqual(
          6,
        );
    }
  });

  it('the корогва is the Sich banner cloth (crimson, gold cross) with a swallowtail notch in all 4 wind frames', () => {
    expect(korohva.frames).toEqual({ idle: BEARER_BANNER.animate.frames });
    expect(BEARER_BANNER.animate).toEqual({ kind: 'cycle', frames: 4, fps: 'wind' });
    expect(korohva.size).toEqual(banner.size);
    expect(korohva.anchor).toEqual(banner.anchor);
    const { w, h } = BANNER_CLOTH;
    const alpha = (f: FrameImage, x: number, y: number): number => f.image.data[(y * f.image.width + x) * 4 + 3] ?? 0;
    for (let i = 0; i < 4; i++) {
      const f = get(`korohva/idle/${nn(i)}`);
      expect(new Set(colorStats(f.image, palette).ramps)).toEqual(new Set(['crimson', 'gold']));
      // The fly end: the middle rows cut 2 px deep, the tails above and below it stand.
      const dy = bannerOffset(w - 1, i);
      const mid = (c: number): number => BANNER_PAD + Math.floor((h - 1) / 2) + bannerOffset(c, i);
      expect(alpha(f, w - 1, mid(w - 1)), `frame ${String(i)}`).toBe(0);
      expect(alpha(f, w - 2, mid(w - 2)), `frame ${String(i)}`).toBe(0);
      expect(alpha(f, w - 1, BANNER_PAD + dy), `frame ${String(i)}`).toBeGreaterThan(0);
      expect(alpha(f, w - 1, BANNER_PAD + h - 1 + dy), `frame ${String(i)}`).toBeGreaterThan(0);
      expect(inNotch(0, 4)).toBe(false);
    }
    for (const [anim, frames] of [
      ['idle', 4],
      ['march', 6],
    ] as const)
      for (let i = 0; i < frames; i++) {
        const h = bearerHoist(anim, i);
        expect(h.dx).toBe(BEARER_BANNER.hoist.dx);
        expect(h.dy, `${anim} ${String(i)}`).toBe(BEARER_BANNER.hoist.dy[anim][i]);
      }
  });

  it('the bearer lifts the pole to march (the cloth rides higher than at rest); the chest is oak and iron only', () => {
    expect(Math.max(...BEARER_BANNER.hoist.dy.march)).toBeLessThan(Math.min(...BEARER_BANNER.hoist.dy.idle));
    const chest = get('skrynia/idle/00');
    expect(new Set(colorStats(chest.image, palette).ramps)).toEqual(new Set(['earth', 'stone']));
    expect(chest.image.width).toBe(CHEST.w + 2);
    expect(byName.has('skrynia@shadow/idle/00')).toBe(true);
  });
});
