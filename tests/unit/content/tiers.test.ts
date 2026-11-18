// Building tiers in the layout (plan M2-05): every building of land 1 × every tier it has is drawn from frames the
// khortytsia generators declare — its own or an explicit fallback to an earlier tier — or waits for its art task.
import { describe, expect, it } from 'vitest';
import { TIER_LEVELS } from '../../../src/content/economy.ts';
import { SICH_BUILDINGS } from '../../../src/content/sich.ts';
import { KHORTYTSIA } from '../../../src/content/villages/khortytsia.ts';
import {
  KHORTYTSIA_WORLD,
  TIER_ART_PENDING,
  tierCount,
  tierProps,
  tierRuns,
  type PlotBuilding,
  type TierPart,
  type TierSprite,
} from '../../../src/content/villages/khortytsia.layout.ts';
import { visualTiers, type VisualTiers } from '../../../src/core/selectors.ts';
import { createInitialState } from '../../../src/core/state.ts';
import { plotShown } from '../../../src/render/scene.ts';
import { frameNames } from '../../../tools/lib/sprites/atlas.ts';
import { loadGenerators } from '../../../tools/lib/sprites/load.ts';

const FRAMES: ReadonlySet<string> = new Set(
  (await loadGenerators()).filter((g) => g.atlas === 'khortytsia').flatMap(frameNames),
);

/** Buildings land 1 shows: its farm/suburb buildings and every Sich building not held back for a later land. */
const LAND_BUILDINGS: readonly PlotBuilding[] = [
  ...KHORTYTSIA.buildings.map((b) => b.id),
  ...SICH_BUILDINGS.filter((b) => b.unlock.kind !== 'land' || b.unlock.land <= KHORTYTSIA.number).map((b) => b.id),
];

/** The frames a part needs: `<stem>/idle/00` (every frame of a `cycle`), and `<stem>@shadow/idle/00` unless off. */
const partFrames = (p: TierPart): string[] => {
  const n = p.animate?.kind === 'cycle' ? p.animate.frames : 1;
  const own = Array.from({ length: n }, (_, f) => `${p.sprite}/idle/${String(f).padStart(2, '0')}`);
  return p.shadow === false ? own : [...own, `${p.sprite}@shadow/idle/00`];
};

/**
 * Frames a tier sprite needs at each of its tiers that `frames` lacks, as `<building> tier N: <frame>` lines; a table
 * of the wrong length is one line.
 */
function missingTierFrames(t: TierSprite, frames: ReadonlySet<string>): string[] {
  let runs;
  try {
    runs = tierRuns(t);
  } catch (error) {
    return [error instanceof Error ? error.message : String(error)];
  }
  const top = tierCount(t.building);
  return runs.flatMap(({ parts, from, until }) =>
    Array.from({ length: (until ?? top + 1) - from }, (_, k) => from + k).flatMap((tier) =>
      parts
        .flatMap(partFrames)
        .filter((name) => !frames.has(name))
        .map((name) => `${t.building} tier ${String(tier)}: ${name}`),
    ),
  );
}

/** Test oracle, independent of tierRuns: the parts of tier `n`, walking back over `prev`. */
function lookAt(t: TierSprite, n: number): readonly TierPart[] {
  for (let i = n - 1; i >= 0; i--) {
    const look = t.tiers[i];
    if (look && 'parts' in look) return look.parts;
  }
  return [];
}

/** Visual tiers of a new game (all 0) with `windmill` at `n`. */
const withWindmill = (n: number): VisualTiers => ({
  ...visualTiers(createInitialState({ seed: 1, now: 0 })),
  windmill: n,
});

const KHATA: TierSprite = {
  building: 'potter',
  x: 0,
  ground: 10,
  tiers: [
    { parts: [{ sprite: 'khata.t1' }] },
    { prev: 'M2-07' },
    { parts: [{ sprite: 'khata.t3' }] },
    { prev: 'M2-07' },
    { prev: 'M2-07' },
    { prev: 'M2-07' },
  ],
};

describe('tier counts come from content (SPEC §3.2/§3.2.1)', () => {
  it('farm and suburb buildings have tiers I–VI, the Sich I–IV', () => {
    // A pin of the SPEC thresholds (§3.2: 1/10/25/50/75/100, §3.2.1: 1/10/25/50): a change here is a SPEC change.
    expect(TIER_LEVELS.farm).toEqual([1, 10, 25, 50, 75, 100]);
    expect(TIER_LEVELS.sich).toEqual([1, 10, 25, 50]);
    expect(tierCount('potter')).toBe(6);
    expect(tierCount('fair')).toBe(6);
    expect(tierCount('kurins')).toBe(4);
  });
});

describe('every building × tier has a frame (plan M2-05)', () => {
  it('the generators declare the frames the M-ART buildings use (sanity of the frame list)', () => {
    expect(FRAMES.has('khata.t1/idle/00')).toBe(true);
    expect(FRAMES.has('khata.t3@emissive/idle/00')).toBe(true);
    expect(FRAMES.has('windmill-sails/idle/07')).toBe(true);
    expect(FRAMES.has('khata.t2/idle/00')).toBe(false);
  });

  it('each building of land 1 is drawn by tier or waits for a named art task — never both, never neither', () => {
    const drawn = new Set(KHORTYTSIA_WORLD.tierSprites.map((t) => t.building));
    for (const id of LAND_BUILDINGS) {
      const pending = TIER_ART_PENDING[id];
      expect(drawn.has(id) !== (pending !== undefined), id).toBe(true);
      if (pending !== undefined) expect(pending, id).toMatch(/^M\d+-\d+$/);
    }
    expect(Object.keys(TIER_ART_PENDING).every((id) => (LAND_BUILDINGS as string[]).includes(id))).toBe(true);
  });

  it('every tier sprite covers I…top with frames that exist, its own or an earlier tier’s', () => {
    for (const t of KHORTYTSIA_WORLD.tierSprites) expect(missingTierFrames(t, FRAMES), t.building).toEqual([]);
  });

  it('fails on a missing frame, a missing @shadow, a missing cycle frame and a table of the wrong length', () => {
    const t1 = { parts: [{ sprite: 'khata.t1' as const }] };
    const noFrames = new Set(['khata.t1/idle/00']);
    expect(missingTierFrames(KHATA, noFrames)).toEqual([
      'potter tier 1: khata.t1@shadow/idle/00',
      'potter tier 2: khata.t1@shadow/idle/00',
      'potter tier 3: khata.t3/idle/00',
      'potter tier 3: khata.t3@shadow/idle/00',
      'potter tier 4: khata.t3/idle/00',
      'potter tier 4: khata.t3@shadow/idle/00',
      'potter tier 5: khata.t3/idle/00',
      'potter tier 5: khata.t3@shadow/idle/00',
      'potter tier 6: khata.t3/idle/00',
      'potter tier 6: khata.t3@shadow/idle/00',
    ]);
    expect(missingTierFrames({ ...KHATA, tiers: [t1, t1, t1, t1, t1] }, FRAMES)).toEqual([
      'potter: 5 tier looks, the building has 6 tiers',
    ]);
    const sails: TierPart = { sprite: 'windmill-sails', shadow: false, animate: { kind: 'cycle', frames: 9, fps: 1 } };
    expect(missingTierFrames({ ...KHATA, tiers: [{ parts: [sails] }, t1, t1, t1, t1, t1] }, FRAMES)).toEqual([
      'potter tier 1: windmill-sails/idle/08',
    ]);
  });

  it('no plain prop draws a tier-sprite building’s own sprite on its plot (no double draw)', () => {
    const generated = new Set(KHORTYTSIA_WORLD.tierSprites.flatMap((t) => tierProps(t).map((p) => JSON.stringify(p))));
    for (const t of KHORTYTSIA_WORLD.tierSprites) {
      // Shared add-ons (tyn, mallows, the yard) may follow the plot; the building's own sprites only via tierProps.
      const own = new Set(t.tiers.flatMap((look) => ('parts' in look ? look.parts.map((p) => p.sprite) : [])));
      const strays = KHORTYTSIA_WORLD.props.filter(
        (p) => p.plot?.building === t.building && own.has(p.sprite) && !generated.has(JSON.stringify(p)),
      );
      expect(strays, t.building).toEqual([]);
    }
  });
});

describe('tier sprites become plot props (render reads visual tiers only)', () => {
  it('khata I at tiers I–II, khata III from III — the M-ART plots, unchanged', () => {
    expect(tierRuns(KHATA).map(({ from, until }) => [from, until])).toEqual([
      [1, 3],
      [3, null],
    ]);
    expect(tierProps(KHATA)).toEqual([
      { sprite: 'khata.t1', x: 0, ground: 10, plot: { building: 'potter', from: 1, until: 3 } },
      { sprite: 'khata.t3', x: 0, ground: 10, plot: { building: 'potter', from: 3 } },
    ]);
  });

  it('at every visual tier 0…top exactly that tier’s parts stand, with add-on offsets', () => {
    const mill: TierSprite = {
      building: 'windmill',
      x: 100,
      ground: 50,
      tiers: [
        { parts: [{ sprite: 'windmill' }] },
        { parts: [{ sprite: 'windmill' }, { sprite: 'cross', dx: -12, dground: 3 }] },
        { prev: 'M2-07' },
        { parts: [{ sprite: 'church' }] },
        { prev: 'M2-07' },
        { parts: [{ sprite: 'belfry' }] },
      ],
    };
    const props = tierProps(mill);
    for (let tier = 0; tier <= tierCount('windmill'); tier++) {
      const shown = props.filter((p) => plotShown(p.plot, withWindmill(tier))).map((p) => [p.sprite, p.x, p.ground]);
      const want = lookAt(mill, tier).map((p) => [p.sprite, 100 + (p.dx ?? 0), 50 + (p.dground ?? 0)]);
      expect(shown, `tier ${String(tier)}`).toEqual(want);
    }
  });

  it('the world places tier sprites by their zone and expands them in place', () => {
    const potter = KHORTYTSIA_WORLD.tierSprites.find((t) => t.building === 'potter');
    expect(potter?.x).toBe(292);
    const i = KHORTYTSIA_WORLD.props.findIndex((p) => p.plot?.building === 'potter' && p.sprite === 'khata.t1');
    expect(KHORTYTSIA_WORLD.props.slice(i, i + 5).map((p) => p.sprite)).toEqual([
      'khata.t1',
      'potter.t2',
      'jugs',
      'khata.t3',
      'potter.t4',
    ]);
  });
});
