// The render bridge (SPEC §9.2, rules/render.md; plan M1-19): the only place render meets the game. It reads the
// state through core selectors and reacts to store events — never dispatches, never writes state (render must not
// import core/actions.ts; ESLint `imports[render-actions]`). On connect and on every event it recomputes the plots' tiers,
// their cosmetic variants (M2-10, from the seed), the Cossacks the army has (M2-19: `CossackHired` → one more walks out
// of the kurin), the food carts' period (M2-20: from the kharch), the visitors' seed and clock (M2-21) and the wind (a new scene only if something shows differently); on `Tapped` it pops a coin where the player tapped.
// M2-12: `BuildingUpgraded` / `SichUpgraded` 0 → 1 builds the plot on screen (scaffold → pop → confetti), `TierReached` celebrates it
// (flash, rising standard) — the level is already in the state; the animation never holds the economy back.
// M2-29 D: a level past the first (`from` ≥ 1) squashes the building as the coins from the counter land (`world.bump`).
// M2-29 D: the household's size (`populationView.villagers`) goes into the scene with the army's.
// M2-26: the big events in content SHAKE shake the camera (`world.shake`; none under «менше руху»).
// M3-14: the raid slots (`raidSceneView`) go into the scene once per change with all its events (`onEvents`): a slot
// that changed is `live` (its squad marches) unless the state was replaced (a load, a reset) or — for a return — the
// change came with an absence (`OfflineApplied`: the squad is simply home, its chest on the maidan, Q14).
import { SHAKE } from '../content/juice.ts';
import type { GameEvent } from '../core/events.ts';
import { raidSceneView } from '../core/raid-selectors.ts';
import { villageOf } from '../core/modifiers.ts';
import { plotVariants, populationView, visualTiers, type PlotVariants, type VisualTiers } from '../core/selectors.ts';
import type { GameState } from '../core/state.ts';
import type { GameStore } from '../core/store.ts';
import { windAt } from '../core/systems/village-mechanics/wind.ts';
import type { SquadScene } from './agents/sim.ts';
import type { WorldApp, WorldTap } from './App.ts';
import { WIND_STRENGTH } from './atmosphere/config.ts';
import type { SceneState, VisitorFeed } from './scene.ts';

/** The big events that shake the camera (content SHAKE, M2-26); typed here so a renamed event fails to compile. */
const SHAKING: ReadonlySet<GameEvent['type']> = new Set<GameEvent['type']>(SHAKE.events);

/** What render may read from the game: the state and the event stream, nothing that changes either. */
export type GameView = Pick<GameStore, 'getState' | 'onEvent' | 'onEvents'>;

/** Visual tiers of a state: core `visualTiers`, or a dev/test override (`?state=tiers` shows locked buildings). */
export type TiersOf = (state: GameState) => VisualTiers;

/** Plot variants of a state: core `plotVariants`, or a dev/test pin (`?state=showcase`: none, the M-ART frames). */
export type VariantsOf = (state: GameState) => PlotVariants | null;

/** The seed the visitors' timetable runs on (M2-21): the game's, or a dev/test pin (`?state=showcase`: no visitors). */
export type VisitorsOf = (state: GameState) => number | null;
const gameSeed: VisitorsOf = (state) => state.seed;

export function sceneOf(
  state: GameState,
  tiersOf: TiersOf = visualTiers,
  variantsOf: VariantsOf = plotVariants,
  visitors: VisitorFeed | null = null,
  raids: readonly SquadScene[] = squadsOf(state, null, []),
): SceneState {
  const people = populationView(state);
  return {
    visitors,
    raids,
    tiers: tiersOf(state),
    variants: variantsOf(state),
    wind: WIND_STRENGTH[windAt(state.seed, state.time.lastSeen, villageOf(state))],
    cossacks: people.cossacks,
    villagers: people.villagers,
    cartPeriodS: people.cartPeriodS,
  };
}

/**
 * The raid slots for the scene after a change with `events`: the same array when no slot changed; a slot that changed
 * is live unless the change came with a replaced state, or is a return that came with an absence. `prev` null = the
 * first look (nothing live).
 */
export function squadsOf(
  state: GameState,
  prev: readonly SquadScene[] | null,
  events: readonly GameEvent[],
): readonly SquadScene[] {
  const slots = raidSceneView(state).slots;
  if (prev && slots.length === prev.length && slots.every((x, i) => x === prev[i]?.state)) return prev;
  const replaced = events.some((e) => e.type === 'StateReplaced');
  const absent = events.some((e) => e.type === 'OfflineApplied');
  return slots.map((x, i) => {
    const was = prev?.[i];
    if (was?.state === x) return was;
    return { state: x, live: prev !== null && !replaced && !(x === 'back' && absent) };
  });
}

// Object.keys widens to string[]; the keys of a VisualTiers / PlotVariants are exactly its ids.
function sameRecord<T extends Readonly<Record<string, number>>>(a: T | null, b: T | null): boolean {
  if (a === null || b === null) return a === b;
  return Object.keys(a).every((k) => a[k] === b[k]);
}

/** Connects `world` to `game`; returns the disconnect function. Call it before UI tap handlers subscribe. */
export function connectWorld(
  world: Pick<WorldApp, 'setScene' | 'onTap' | 'spawnCoin' | 'construct' | 'celebrate' | 'bump' | 'shake'>,
  game: GameView,
  tiersOf: TiersOf = visualTiers,
  variantsOf: VariantsOf = plotVariants,
  visitorsOf: VisitorsOf = gameSeed,
): () => void {
  // The visitors' timetable (M2-21): the seed is fixed for a game; time is read from the state each frame by render.
  const seed = visitorsOf(game.getState());
  const visitors: VisitorFeed | null = seed === null ? null : { seed, gameMs: () => game.getState().time.lastSeen };
  let raids = squadsOf(game.getState(), null, []);
  let scene = sceneOf(game.getState(), tiersOf, variantsOf, visitors, raids);
  world.setScene(scene);
  const refresh = (): void => {
    const next = sceneOf(game.getState(), tiersOf, variantsOf, visitors, raids);
    // A new object only when something shows differently: the layers compare nothing, they just read it.
    if (
      next.wind === scene.wind &&
      next.cossacks === scene.cossacks &&
      next.villagers === scene.villagers &&
      next.cartPeriodS === scene.cartPeriodS &&
      next.raids === scene.raids &&
      sameRecord(next.tiers, scene.tiers) &&
      sameRecord(next.variants, scene.variants)
    )
      return;
    scene = next;
    world.setScene(scene);
  };

  // The point of the last tap: the coin of the `Tapped` it causes pops there.
  let lastTap: WorldTap | null = null;
  const offTap = world.onTap((tap) => {
    // A tap on a building opens its row (SPEC §3.3) and earns nothing: no coin.
    lastTap = tap.building ? null : tap;
  });
  const offEvents = game.onEvent((e) => {
    if (SHAKING.has(e.type)) world.shake();
    switch (e.type) {
      case 'Tapped':
        if (lastTap) world.spawnCoin(lastTap.x, lastTap.y);
        lastTap = null;
        return;
      case 'ActionRejected':
        return;
      case 'BuildingUpgraded':
      case 'SichUpgraded':
        // Before the refresh: the new plot must not stand for a frame before its scaffold does.
        if (e.from === 0) world.construct(e.id);
        // An ordinary upgrade (M2-29 D): the squash as the coins land. Only actions emit it: never on load/offline.
        else world.bump(e.id);
        refresh();
        return;
      case 'TierReached':
        world.celebrate(e.id);
        refresh();
        return;
      default:
        // Every other event may change what stands (a new kind of event included): refresh() only makes a new scene
        // when something shows differently, and events are rare (a tick without a wind change emits none).
        refresh();
    }
  });
  // After every `onEvent` above: the change's events together say whether a raid slot changed live.
  const offBatch = game.onEvents((events) => {
    const next = squadsOf(game.getState(), raids, events);
    if (next === raids) return;
    raids = next;
    refresh();
  });
  return () => {
    offTap();
    offEvents();
    offBatch();
  };
}
