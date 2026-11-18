// Loading the game and the saver (SPEC §9.5, rules/save.md; plan M1-13). Boot reads both slots and lets the core pick
// (core/save/load.ts); the saver then writes each save over the slot that was NOT just loaded or written, so the last
// good copy is never the one being replaced. A save from a newer game disables saving altogether (never overwrite).
import { chooseSave, type Slot } from '../core/save/load.ts';
import { encodeSave } from '../core/save/serialize.ts';
import type { GameState } from '../core/state.ts';
import type { StorageService } from './storage.ts';

/** What the UI tells the player after loading. */
export type BootNotice =
  | 'none'
  /** One slot was damaged; the other was loaded. */
  | 'restored'
  /** Both slots were damaged: a new game. */
  | 'corrupt'
  /** The save is from a newer game: update it; nothing is saved meanwhile. */
  | 'newer';

export interface Saver {
  /** false after a «newer» boot: saves are dropped. */
  readonly enabled: boolean;
  save(state: GameState): void;
}

export interface Boot {
  readonly state: GameState;
  readonly notice: BootNotice;
  readonly saver: Saver;
}

const other = (slot: Slot): Slot => (slot === 'a' ? 'b' : 'a');

export function createSaver(storage: StorageService, lastSlot: Slot | null, enabled = true): Saver {
  let next: Slot = lastSlot === null ? 'a' : other(lastSlot);
  return {
    enabled,
    save(state) {
      if (!enabled) return;
      const slot = next;
      next = other(slot);
      // A failed write (quota) leaves the other slot as the good copy; the next save tries again.
      storage.save(slot, encodeSave(state)).catch((error: unknown) => {
        console.warn('save to slot %s failed', slot, error);
      });
    },
  };
}

export async function bootGame(storage: StorageService, fresh: () => GameState): Promise<Boot> {
  const [a, b] = await Promise.all([storage.load('a'), storage.load('b')]);
  const choice = chooseSave(a, b);
  switch (choice.kind) {
    case 'loaded':
      return {
        state: choice.state,
        notice: choice.fallback ? 'restored' : 'none',
        saver: createSaver(storage, choice.slot),
      };
    case 'fresh':
      return {
        state: fresh(),
        notice: choice.reason === 'corrupt' ? 'corrupt' : 'none',
        saver: createSaver(storage, null),
      };
    case 'newer':
      return { state: fresh(), notice: 'newer', saver: createSaver(storage, null, false) };
  }
}
