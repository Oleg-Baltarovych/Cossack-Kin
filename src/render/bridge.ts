// The render bridge (SPEC §9.2, rules/render.md; plan M1-19): the only place render meets the game. It reads the
// state through core selectors and reacts to store events — never dispatches, never writes state (render must not
// import core/actions.ts; ESLint `imports[render-actions]`). On connect and on every event it recomputes the plots' tiers
// and the wind (a new scene only if something shows differently); on `Tapped` it pops a coin where the player tapped.
import { villageOf } from '../core/modifiers.ts';
import { visualTiers, type VisualTiers } from '../core/selectors.ts';
import type { GameState } from '../core/state.ts';
import type { GameStore } from '../core/store.ts';
import { windAt } from '../core/systems/village-mechanics/wind.ts';
import type { WorldApp, WorldTap } from './App.ts';
import { WIND_STRENGTH } from './atmosphere/config.ts';
import type { SceneState } from './scene.ts';

/** What render may read from the game: the state and the event stream, nothing that changes either. */
export type GameView = Pick<GameStore, 'getState' | 'onEvent'>;

/** Visual tiers of a state: core `visualTiers`, or a dev/test override (`?state=tiers` shows locked buildings). */
export type TiersOf = (state: GameState) => VisualTiers;

export function sceneOf(state: GameState, tiersOf: TiersOf = visualTiers): SceneState {
  return { tiers: tiersOf(state), wind: WIND_STRENGTH[windAt(state.seed, state.time.lastSeen, villageOf(state))] };
}

// Object.keys widens to string[]; the keys of a VisualTiers are exactly its building ids.
const sameTiers = (a: VisualTiers | null, b: VisualTiers | null): boolean =>
  a !== null && b !== null && Object.keys(a).every((k) => a[k as keyof VisualTiers] === b[k as keyof VisualTiers]);

/** Connects `world` to `game`; returns the disconnect function. Call it before UI tap handlers subscribe. */
export function connectWorld(
  world: Pick<WorldApp, 'setScene' | 'onTap' | 'spawnCoin'>,
  game: GameView,
  tiersOf: TiersOf = visualTiers,
): () => void {
  let scene = sceneOf(game.getState(), tiersOf);
  world.setScene(scene);
  const refresh = (): void => {
    const next = sceneOf(game.getState(), tiersOf);
    // A new object only when something shows differently: the layers compare nothing, they just read it.
    if (next.wind === scene.wind && sameTiers(next.tiers, scene.tiers)) return;
    scene = next;
    world.setScene(scene);
  };

  // The point of the last tap: the coin of the `Tapped` it causes pops there.
  let lastTap: WorldTap | null = null;
  const offTap = world.onTap((tap) => {
    lastTap = tap;
  });
  const offEvents = game.onEvent((e) => {
    switch (e.type) {
      case 'Tapped':
        if (lastTap) world.spawnCoin(lastTap.x, lastTap.y);
        lastTap = null;
        return;
      case 'ActionRejected':
        return;
      default:
        // Every other event may change what stands (a new kind of event included): refresh() only makes a new scene
        // when something shows differently, and events are rare (a tick without a wind change emits none).
        refresh();
    }
  });
  return () => {
    offTap();
    offEvents();
  };
}
