// Food carts (plan M2-20): they leave the farm on turns paced by `AgentContext.cartPeriodS` (core `populationView`:
// more kharch → a shorter period), drive the road east full to stop short of the gate — never past it — unload, turn
// and drive back empty beyond the world's edge; at most `AGENT_BUDGET.cart` (3) out at once; none without food; the
// driver walks with the oxen. Deterministic per seed.
import { describe, expect, it } from 'vitest';
import {
  AGENT_BUDGET,
  CART_PERIOD,
  CART_TRIP,
  isCartSprite,
  isVillagerSprite,
  type AgentSpawn,
  type CartSpawn,
  type PathGraph,
} from '../../../src/content/agents.ts';
import { KHORTYTSIA_WORLD } from '../../../src/content/villages/khortytsia.layout.ts';
import { VIZ_REACH } from '../../../assets-src/gen/people/viz/index.ts';
import {
  agentCounts,
  agentPoses,
  createAgents,
  stepInPlace,
  TICK_HZ,
  type AgentContext,
  type AgentPool,
  type AgentPose,
} from '../../../src/render/agents/sim.ts';

/** The road: the farm's west end w, the suburb s, the Sich gate g and the maidan m behind it (Cossacks only). */
const G: PathGraph = {
  nodes: [
    { id: 'w', kind: 'way', x: 24, ground: 146, zone: 'farm' },
    { id: 's', kind: 'way', x: 400, ground: 146, zone: 'suburb' },
    { id: 'g', kind: 'gate', x: 700, ground: 146, zone: 'sich' },
    { id: 'm', kind: 'way', x: 800, ground: 150, zone: 'sich', only: ['cossack'] },
  ],
  edges: [
    ['w', 's'],
    ['s', 'g'],
    ['g', 'm'],
  ],
};
const GATE_X = 700;

const cart = (): CartSpawn => ({
  routine: 'cart',
  role: 'cart',
  sprite: 'viz.full',
  home: 'w',
  depot: { at: 'w', dx: -72, facing: 1 },
  gate: 'g',
  driver: 'selianyn.c',
  speed: 18,
  phase: 0,
});
const CARTS: readonly AgentSpawn[] = [cart(), cart(), cart()];

const ctx = (cartPeriodS: number | null, minutes = 13 * 60): AgentContext => ({ minutes, tiers: null, cartPeriodS });

const cartPoses = (pool: AgentPool): AgentPose[] => agentPoses(pool).filter((p) => isCartSprite(p.sprite));

/** Steps `pool` for `seconds`, calling `each` after every second. */
function run(pool: AgentPool, c: AgentContext, seconds: number, each: (pool: AgentPool) => void): void {
  for (let s = 0; s < seconds; s++) {
    stepInPlace(pool, TICK_HZ, c);
    each(pool);
  }
}

/**
 * Ticks at which a cart left over `seconds` (a cart pose that was not there the tick before), the period at each
 * second given by `period`.
 */
function departureTicks(period: (second: number) => number | null, seconds: number): number[] {
  const pool = createAgents(G, CARTS, AGENT_BUDGET, 1, ctx(period(0)));
  let seen = new Set(cartPoses(pool).map((p) => p.id));
  const out: number[] = [];
  for (let t = 0; t < seconds * TICK_HZ; t++) {
    stepInPlace(pool, 1, ctx(period(Math.floor(t / TICK_HZ))));
    const now = new Set(cartPoses(pool).map((q) => q.id));
    for (const id of now) if (!seen.has(id)) out.push(t);
    seen = now;
  }
  return out;
}

const gaps = (ticks: readonly number[]): number[] => ticks.slice(1).map((t, i) => t - (ticks[i] ?? 0));

describe('food carts (plan M2-20)', () => {
  it('the content reach matches the drawn cart (the leading nose)', () => {
    expect(CART_TRIP.reach).toBe(VIZ_REACH);
  });

  it('leave on the period: a shorter period (more kharch) sends more carts', () => {
    const slow = departureTicks(() => CART_PERIOD.maxS, 1200);
    const fast = departureTicks(() => CART_PERIOD.minS, 1200);
    expect(slow.length).toBeGreaterThanOrEqual(4);
    expect(fast.length).toBeGreaterThan(slow.length);
    // Never two departures closer than the period.
    for (const g of gaps(slow)) expect(g).toBeGreaterThanOrEqual(CART_PERIOD.maxS * TICK_HZ);
    for (const g of gaps(fast)) expect(g).toBeGreaterThanOrEqual(CART_PERIOD.minS * TICK_HZ);
  });

  it('a period that changes while carts run never bunches them: departures stay ≥ minS apart', () => {
    const periods = [CART_PERIOD.minS, CART_PERIOD.maxS, CART_PERIOD.minS * 1.3, null, CART_PERIOD.minS];
    const left = departureTicks((s) => periods[Math.floor(s / 170) % periods.length] ?? null, 1700);
    expect(left.length).toBeGreaterThan(5);
    for (const g of gaps(left)) expect(g).toBeGreaterThanOrEqual(CART_PERIOD.minS * TICK_HZ);
  });

  it('the turns go round the carts of the pool, not the content budget', () => {
    const pool = createAgents(G, [cart()], AGENT_BUDGET, 2, ctx(CART_PERIOD.minS));
    let trips = 0;
    let full = cartPoses(pool)[0]?.sprite === 'viz.full';
    run(pool, ctx(CART_PERIOD.minS), 1200, (p) => {
      const now = cartPoses(p)[0]?.sprite === 'viz.full';
      if (now && !full) trips += 1;
      full = now;
    });
    // One cart, a round trip of ~90 s on this road: it sets out again as soon as it is back (≈ 13 trips in 20 min).
    // Turns going round three budget slots would give it only every third period (8).
    expect(trips).toBeGreaterThanOrEqual(11);
  });

  it('no food, no carts: none leaves and none is on the road', () => {
    const pool = createAgents(G, CARTS, AGENT_BUDGET, 1, ctx(null));
    expect(cartPoses(pool)).toEqual([]);
    run(pool, ctx(null), 300, (p) => {
      expect(cartPoses(p)).toEqual([]);
    });
    expect(agentCounts(pool).cart).toBe(0);
  });

  it('never past the gate, at most three on the road, the driver with the oxen', () => {
    const spawns = [...CARTS, cart(), cart()];
    const pool = createAgents(G, spawns, AGENT_BUDGET, 3, ctx(CART_PERIOD.minS / 2));
    let most = 0;
    run(pool, ctx(CART_PERIOD.minS / 2), 900, (p) => {
      const poses = agentPoses(p);
      const carts = poses.filter((q) => isCartSprite(q.sprite));
      most = Math.max(most, carts.length);
      expect(agentCounts(p).cart).toBe(carts.length);
      for (const c of carts) {
        expect(c.x + CART_TRIP.reach, `cart ${String(c.id)}`).toBeLessThanOrEqual(GATE_X);
        // Drawn in its own direction: never mirrored.
        expect(c.facing).toBe(1);
      }
      const drivers = poses.filter((q) => !isCartSprite(q.sprite));
      expect(drivers).toHaveLength(carts.length);
      for (const d of drivers) {
        expect(isVillagerSprite(d.sprite)).toBe(true);
        expect(d.x).toBeLessThanOrEqual(GATE_X);
        expect(carts.some((c) => Math.abs(c.x - d.x) <= CART_TRIP.driver.ahead + 1)).toBe(true);
      }
    });
    expect(most).toBe(AGENT_BUDGET.cart);
  });

  it('goes east full, stops at the gate, comes back west empty and leaves the world', () => {
    const pool = createAgents(G, [cart()], AGENT_BUDGET, 5, ctx(CART_PERIOD.maxS));
    const track: { x: number; sprite: string; anim: string }[] = [];
    run(pool, ctx(CART_PERIOD.maxS), 2 * CART_PERIOD.maxS, (p) => {
      const c = cartPoses(p)[0];
      track.push(c ? { x: c.x, sprite: c.sprite, anim: c.anim } : { x: NaN, sprite: 'none', anim: 'none' });
    });
    for (let i = 1; i < track.length; i++) {
      const [a, b] = [track[i - 1], track[i]];
      if (!a || !b || a.sprite !== b.sprite || b.anim !== 'walk' || a.anim !== 'walk') continue;
      if (b.sprite === 'viz.full') expect(b.x).toBeGreaterThan(a.x);
      if (b.sprite === 'viz.empty') expect(b.x).toBeLessThan(a.x);
    }
    const atGate = track.filter((t) => t.anim === 'idle');
    expect(atGate.length).toBeGreaterThan(0);
    for (const t of atGate) expect(t.x).toBe(GATE_X - CART_TRIP.reach);
    expect(track.some((t) => t.sprite === 'viz.full' && t.anim === 'walk')).toBe(true);
    expect(track.some((t) => t.sprite === 'viz.empty' && t.anim === 'walk')).toBe(true);
    // Between trips it is out of sight: no pose (layers drop its sprite by id).
    expect(track.some((t) => t.sprite === 'none')).toBe(true);
  });

  it('a frame is a function of the seed and the ticks', () => {
    const make = (seed: number): AgentPose[] => {
      const pool = createAgents(G, CARTS, AGENT_BUDGET, seed, ctx(CART_PERIOD.minS));
      stepInPlace(pool, 97 * TICK_HZ, ctx(CART_PERIOD.minS));
      return agentPoses(pool);
    };
    expect(make(4)).toEqual(make(4));
  });

  it('the first frame already has carts on the road (they ran their history at creation)', () => {
    const pool = createAgents(G, CARTS, AGENT_BUDGET, 1, ctx(CART_PERIOD.minS));
    expect(cartPoses(pool).length).toBeGreaterThan(0);
  });

  it('the land: three carts on the road to the Sich gate, waiting out of sight', () => {
    const carts = KHORTYTSIA_WORLD.agents.filter((a): a is CartSpawn => a.routine === 'cart');
    expect(carts).toHaveLength(AGENT_BUDGET.cart);
    for (const c of carts) {
      expect(KHORTYTSIA_WORLD.paths.nodes.find((n) => n.id === c.gate)?.kind).toBe('gate');
      const depot = KHORTYTSIA_WORLD.paths.nodes.find((n) => n.id === c.depot.at);
      if (!depot) throw new Error(`cart depot ${c.depot.at} is not on the graph`);
      // The whole cart (half its 64 px) and its driver ahead of it stay left of the world's edge.
      expect(depot.x + c.depot.dx + CART_TRIP.reach).toBeLessThan(0);
    }
  });
});
