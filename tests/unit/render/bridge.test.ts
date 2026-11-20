import { describe, expect, it } from 'vitest';
import { KHORTYTSIA_WORLD, type Plot } from '../../../src/content/villages/khortytsia.layout.ts';
import { Big } from '../../../src/core/big.ts';
import { plotVariant, plotVariants, visualTiers } from '../../../src/core/selectors.ts';
import { createInitialState, type GameState } from '../../../src/core/state.ts';
import { createStore } from '../../../src/core/store.ts';
import { windAt } from '../../../src/core/systems/village-mechanics/wind.ts';
import type { WorldTap } from '../../../src/render/App.ts';
import { WIND_STRENGTH } from '../../../src/render/atmosphere/config.ts';
import { connectWorld, sceneOf } from '../../../src/render/bridge.ts';
import { AGENT_BUDGET } from '../../../src/content/agents.ts';
import { agentPoses, createAgents, stepInPlace, type AgentContext } from '../../../src/render/agents/sim.ts';
import { plotShown, type SceneState } from '../../../src/render/scene.ts';
import {
  FROZEN_NOW,
  noVariants,
  parseGameDebug,
  presetState,
  showcaseTiers,
  tiersIgnoringUnlocks,
} from '../../../src/ui/debug/gameDebug.ts';

const T0 = 1_763_400_000_000;

function fakeWorld() {
  const scenes: SceneState[] = [];
  const coins: [number, number][] = [];
  const built: string[] = [];
  const celebrated: string[] = [];
  let tap: ((t: WorldTap) => void) | null = null;
  return {
    scenes,
    coins,
    built,
    celebrated,
    tapAt: (x: number, y: number, building: WorldTap['building'] = null) =>
      tap?.({ clientX: 0, clientY: 0, x, y, building }),
    world: {
      setScene: (s: SceneState) => scenes.push(s),
      onTap: (l: (t: WorldTap) => void) => {
        tap = l;
        return () => {
          tap = null;
        };
      },
      spawnCoin: (x: number, y: number) => coins.push([x, y]),
      construct: (b: string) => built.push(b),
      celebrate: (b: string) => celebrated.push(b),
    },
  };
}

function rich(): GameState {
  const s = createInitialState({ seed: 4, now: T0 });
  return { ...s, currencies: { ...s.currencies, ducats: Big.from(1e9) } };
}

describe('plotShown (M1-19)', () => {
  const plot: Plot = { building: 'potter', from: 1, until: 3 };
  it('no game attached shows everything; an empty plot hides; [from, until) picks the tier sprite', () => {
    expect(plotShown(plot, null, null)).toBe(true);
    expect(plotShown(undefined, visualTiers(rich()), null)).toBe(true);
    const at = (potter: number): boolean => {
      const s = rich();
      return plotShown(
        plot,
        visualTiers({ ...s, village: { ...s.village, levels: { ...s.village.levels, potter } } }),
        null,
      );
    };
    expect([at(0), at(1), at(24), at(25)]).toEqual([false, true, true, false]);
  });

  it('every plot in the layouts names a building that exists in the tiers', () => {
    const tiers = visualTiers(rich());
    for (const layout of [KHORTYTSIA_WORLD]) {
      for (const item of [...layout.props, ...layout.decals]) {
        if (item.plot) expect(tiers[item.plot.building], item.sprite).toBeTypeOf('number');
      }
    }
  });
});

describe('connectWorld (M1-19)', () => {
  it('sets the scene at once, and again only when a tier or the wind changes', () => {
    const store = createStore(rich());
    const f = fakeWorld();
    const off = connectWorld(f.world, store);
    expect(f.scenes).toHaveLength(1);
    expect(f.scenes[0]?.tiers?.potter).toBe(0);
    store.dispatch({ type: 'buyBuilding', id: 'field', mode: 1 }, T0 + 100);
    // The field has no plot sprite, but its tier changed 0 → I: a new scene.
    expect(f.scenes).toHaveLength(2);
    store.dispatch({ type: 'buyBuilding', id: 'field', mode: 1 }, T0 + 200);
    // Level 2 is still tier I: nothing to redraw.
    expect(f.scenes).toHaveLength(2);
    store.dispatch({ type: 'buyBuilding', id: 'potter', mode: 25 }, T0 + 300);
    expect(f.scenes.at(-1)?.tiers?.potter).toBe(3);
    off();
    store.dispatch({ type: 'buyBuilding', id: 'garden', mode: 1 }, T0 + 400);
    expect(f.scenes).toHaveLength(3);
  });

  it('a coin pops where the world was tapped — only when the core accepted the tap', () => {
    const store = createStore(rich());
    const f = fakeWorld();
    connectWorld(f.world, store);
    f.tapAt(120, 300);
    store.dispatch({ type: 'tap' }, T0 + 100);
    expect(f.coins).toEqual([[120, 300]]);
    // 11 taps in one second: the 11th is refused (plan Q8) and pops nothing.
    for (let i = 0; i < 11; i += 1) {
      f.tapAt(10, 10);
      store.dispatch({ type: 'tap' }, T0 + 1000 + i);
    }
    expect(f.coins).toHaveLength(11);
  });

  it('a tap on a building (M2-13) pops no coin, even if a Tapped follows from elsewhere', () => {
    const store = createStore(rich());
    const f = fakeWorld();
    connectWorld(f.world, store);
    f.tapAt(120, 300, 'windmill');
    store.dispatch({ type: 'tap' }, T0 + 100);
    expect(f.coins).toEqual([]);
    // The next ground tap pops its own coin where it was.
    f.tapAt(40, 280);
    store.dispatch({ type: 'tap' }, T0 + 200);
    expect(f.coins).toEqual([[40, 280]]);
  });

  it('the wind follows the game: storm bends, calm stills (render WIND_STRENGTH)', () => {
    const s = rich();
    expect(sceneOf(s).wind).toBe(WIND_STRENGTH[windAt(s.seed, s.time.lastSeen)]);
  });
});

describe('construction and tier juice (M2-12)', () => {
  it('the first level builds (scaffold → pop), a milestone celebrates; the level is in the state at once', () => {
    const store = createStore(rich());
    const f = fakeWorld();
    connectWorld(f.world, store);
    store.dispatch({ type: 'buyBuilding', id: 'field', mode: 1 }, T0 + 100);
    expect(store.getState().village.levels.field).toBe(1);
    expect(f.built).toEqual(['field']);
    expect(f.celebrated).toEqual([]);
    store.dispatch({ type: 'buyBuilding', id: 'field', mode: 10 }, T0 + 200);
    expect(store.getState().village.levels.field).toBe(11);
    expect(f.built).toEqual(['field']);
    expect(f.celebrated).toEqual(['field']);
    // 0 → 10 in one purchase: built and celebrated (the celebration waits for the reveal in render).
    store.dispatch({ type: 'buyBuilding', id: 'garden', mode: 10 }, T0 + 300);
    expect(f.built).toEqual(['field', 'garden']);
    expect(f.celebrated).toEqual(['field', 'garden']);
  });
});

describe('plot variants in the scene (M2-10)', () => {
  const kennel: Plot = { building: 'potter', from: 1, variant: 1 };
  it('a variant add-on stands only with its plot variant, and never without a game (the M-ART frames)', () => {
    const tiers = visualTiers({
      ...rich(),
      village: { ...rich().village, levels: { ...rich().village.levels, potter: 1 } },
    });
    const variants = (potter: number) => ({ ...plotVariants(rich()), potter });
    expect(plotShown(kennel, tiers, variants(1))).toBe(true);
    expect(plotShown(kennel, tiers, variants(0))).toBe(false);
    expect(plotShown(kennel, tiers, null)).toBe(false);
    expect(plotShown(kennel, null, null)).toBe(false);
    // The variant still needs its building to stand.
    expect(plotShown(kennel, visualTiers(rich()), variants(1))).toBe(false);
  });

  it('the scene takes the variants from the game seed; showcase pins none', () => {
    for (const seed of [1, 2, 3]) {
      const s = createInitialState({ seed, now: T0 });
      expect(sceneOf(s).variants?.potter).toBe(plotVariant(seed, 'potter'));
    }
    expect(sceneOf(presetState('showcase', 1, FROZEN_NOW), showcaseTiers, noVariants).variants).toBeNull();
  });
});

describe('debug presets (M1-19)', () => {
  it('?freeze puts seed 1 in a breeze: the wind the M-ART frames were judged with', () => {
    expect(windAt(1, FROZEN_NOW)).toBe('breeze');
  });

  it('showcase builds every plot to the M-ART tier; fresh leaves them empty', () => {
    const show = visualTiers(presetState('showcase', 1, FROZEN_NOW));
    expect(show).toMatchObject({ potter: 3, windmill: 3, walls: 2, kurins: 2, maidan: 2, special: 2, church: 2 });
    expect(visualTiers(presetState('fresh', 1, FROZEN_NOW))).toMatchObject({ potter: 0, windmill: 0, walls: 0 });
  });

  it('showcase draws the windmill at tier I (its M-ART sprite) while the game has it at III', () => {
    const state = presetState('showcase', 1, FROZEN_NOW);
    expect(showcaseTiers(state)).toEqual({ ...visualTiers(state), windmill: 1 });
    expect(visualTiers(state).windmill).toBe(3);
  });

  it('?state=tiers&tier=N shows every building at visual tier N (the Sich capped at IV, the cannonry hidden)', () => {
    const farm = ['field', 'garden', 'apiary', 'windmill', 'potter', 'smithy', 'tavern', 'fair'];
    const sich = ['kurins', 'maidan', 'walls', 'treasury', 'church', 'special'];
    for (const n of [0, 1, 2, 3, 4, 5, 6]) {
      const state = presetState('tiers', 1, FROZEN_NOW, n);
      const t: Record<string, number> = sceneOf(state, tiersIgnoringUnlocks).tiers ?? {};
      for (const id of farm) expect(t[id], `${id} @${String(n)}`).toBe(n);
      for (const id of sich) expect(t[id], `${id} @${String(n)}`).toBe(Math.min(n, 4));
      expect(t['cannonry']).toBe(0);
      // The game itself keeps the church locked until every farm building is at 25 (tier III); only the scene shows it.
      expect(visualTiers(state).church).toBe(n >= 3 ? Math.min(n, 4) : 0);
    }
  });

  it('parses ?state=tiers&tier=N from an allowlist; anything else is the top tier', () => {
    const tierOf = (q: string): number => parseGameDebug(q, 'test').tier;
    expect(parseGameDebug('?state=tiers&tier=0', 'test')).toMatchObject({ preset: 'tiers', tier: 0 });
    expect(tierOf('?state=tiers&tier=4')).toBe(4);
    for (const bad of ['', '&tier=7', '&tier=-1', '&tier=1.0', '&tier=%201', '&tier=x']) {
      expect(tierOf(`?state=tiers${bad}`), bad).toBe(6);
    }
    expect(parseGameDebug('?state=tiers&tier=2', 'production')).toMatchObject({ preset: null });
  });
});

describe('connectWorld follows every change (M1-19 code review)', () => {
  it('the wind changes through store ticks: a new scene with the new strength', () => {
    const store = createStore(rich());
    const f = fakeWorld();
    connectWorld(f.world, store);
    const s = store.getState();
    // Walk 10-minute slots until the wind level changes.
    let t = s.time.lastSeen;
    const start = windAt(s.seed, t);
    while (windAt(s.seed, t) === start) t += 600_000;
    for (let now = s.time.lastSeen + 1000; now <= t + 1000; now += 1000) store.tick(now);
    expect(f.scenes.at(-1)?.wind).toBe(WIND_STRENGTH[windAt(s.seed, t)]);
    expect(f.scenes.at(-1)?.wind).not.toBe(f.scenes[0]?.wind);
  });

  it('a loaded save (StateReplaced) and a long absence (OfflineApplied) both refresh the plots', () => {
    const store = createStore(rich());
    const f = fakeWorld();
    connectWorld(f.world, store);
    const built = rich();
    store.replace({ ...built, village: { ...built.village, levels: { ...built.village.levels, potter: 30 } } });
    expect(f.scenes.at(-1)?.tiers?.potter).toBe(3);
    const count = f.scenes.length;
    store.tick(store.getState().time.lastSeen + 3 * 3600_000);
    // Nothing that shows changed unless the wind did: a scene only when it differs.
    expect(f.scenes.length - count).toBeLessThanOrEqual(1);
  });

  it('events that change nothing on screen make no new scene (claiming a return)', () => {
    const store = createStore(rich());
    const f = fakeWorld();
    connectWorld(f.world, store);
    store.dispatch({ type: 'claimReturn' }, T0 + 10);
    store.dispatch({ type: 'hire', n: 1 }, T0 + 20);
    expect(f.scenes).toHaveLength(1);
  });
});

describe('the army walks into the scene (M2-19)', () => {
  it('CossackHired → a scene with one more Cossack, who walks out of the kurin door', () => {
    const base = rich();
    const store = createStore({
      ...base,
      village: { ...base.village, sichLevels: { ...base.village.sichLevels, kurins: 5, maidan: 1 } },
      army: { infantry: 2 },
    });
    const f = fakeWorld();
    const hired: number[] = [];
    store.onEvent((e) => {
      if (e.type === 'CossackHired') hired.push(e.total);
    });
    connectWorld(f.world, store);
    const before = f.scenes.at(-1);
    expect(before?.cossacks).toBe(2);
    const ctx = (scene: SceneState | undefined): AgentContext => ({
      minutes: 12 * 60,
      tiers: scene?.tiers ?? null,
      ...(scene?.cossacks === undefined ? {} : { cossacks: scene.cossacks }),
      ...(scene?.cartPeriodS === undefined ? {} : { cartPeriodS: scene.cartPeriodS }),
    });
    const pool = createAgents(KHORTYTSIA_WORLD.paths, KHORTYTSIA_WORLD.agents, AGENT_BUDGET, 1, ctx(before));
    const ids = (): number[] => agentPoses(pool).map((p) => p.id);
    const seen = new Set(ids());

    store.dispatch({ type: 'hire', n: 1 }, T0 + 100);
    expect(hired).toEqual([3]);
    const after = f.scenes.at(-1);
    expect(after?.cossacks).toBe(3);
    stepInPlace(pool, 1, ctx(after));
    const fresh = agentPoses(pool).filter((p) => !seen.has(p.id));
    expect(fresh).toHaveLength(1);
    const kurin = KHORTYTSIA_WORLD.paths.nodes.find((n) => n.id === 'sich.kurin');
    expect(fresh[0]?.anim).toBe('walk');
    expect(Math.abs((fresh[0]?.x ?? 0) - (kurin?.x ?? -99))).toBeLessThanOrEqual(1);
    expect(Math.abs((fresh[0]?.ground ?? 0) - (kurin?.ground ?? -99))).toBeLessThanOrEqual(1);
  });
});
