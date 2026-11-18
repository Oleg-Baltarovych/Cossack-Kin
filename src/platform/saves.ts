// Loading the game and the saver (SPEC §9.5, rules/save.md; plan M1-13). Boot reads both slots and lets the core pick
// (core/save/load.ts); the saver then writes each save over the slot that was NOT just loaded or written, so the last
// good copy is never the one being replaced, and numbers its writes (`seq`) so a later save wins even with the same
// `lastSeen`. Saving stays off when it could destroy something: a save from a newer game, or a storage that cannot be
// read. Damaged saves are copied aside before a fresh game writes over them.
import { chooseSave, type Slot } from '../core/save/load.ts';
import { encodeSave } from '../core/save/serialize.ts';
import type { GameState } from '../core/state.ts';
import type { StorageService } from './storage.ts';

/** What the UI tells the player after loading. */
export type BootNotice =
  | 'none'
  /** One slot was damaged; the other was loaded. */
  | 'restored'
  /** Both slots were damaged: a new game (the damaged copies are kept aside). */
  | 'corrupt'
  /** The save is from a newer game: update it; nothing is saved meanwhile. */
  | 'newer'
  /** The storage cannot be read (blocked, private mode): this session is not saved. */
  | 'unavailable';

export interface Saver {
  /** false when saving could destroy something (newer save, unreadable storage): saves are dropped. */
  readonly enabled: boolean;
  save(state: GameState): void;
  /** Writes that failed in a row (quota, storage gone); 0 after a success. */
  failures(): number;
}

export interface Boot {
  readonly state: GameState;
  readonly notice: BootNotice;
  readonly saver: Saver;
}

const other = (slot: Slot): Slot => (slot === 'a' ? 'b' : 'a');

export function createSaver(storage: StorageService, lastSlot: Slot | null, lastSeq = 0, enabled = true): Saver {
  let next: Slot = lastSlot === null ? 'a' : other(lastSlot);
  let seq = lastSeq;
  let failed = 0;
  return {
    enabled,
    failures: () => failed,
    save(state) {
      if (!enabled) return;
      const slot = next;
      next = other(slot);
      seq += 1;
      // A failed write (quota) leaves the other slot as the good copy; the next save tries again.
      storage.save(slot, encodeSave(state, seq)).then(
        () => {
          failed = 0;
        },
        (error: unknown) => {
          failed += 1;
          console.warn('save to slot %s failed', slot, error);
        },
      );
    },
  };
}

export async function bootGame(storage: StorageService, fresh: () => GameState): Promise<Boot> {
  let raw: [string | null, string | null];
  try {
    raw = await Promise.all([storage.load('a'), storage.load('b')]);
  } catch {
    // Cannot read ≠ nothing saved: play, but never write over slots we could not see.
    return { state: fresh(), notice: 'unavailable', saver: createSaver(storage, null, 0, false) };
  }
  const [a, b] = raw;
  const choice = chooseSave(a, b);
  switch (choice.kind) {
    case 'loaded':
      return {
        state: choice.state,
        notice: choice.fallback ? 'restored' : 'none',
        saver: createSaver(storage, choice.slot, choice.seq),
      };
    case 'fresh':
      if (choice.reason === 'corrupt') {
        // Keep the damaged text (often only the checksum is off) for an import or a bug report (M9).
        await Promise.all([
          a === null ? null : storage.backup('a', a).catch(() => undefined),
          b === null ? null : storage.backup('b', b).catch(() => undefined),
        ]);
      }
      return {
        state: fresh(),
        notice: choice.reason === 'corrupt' ? 'corrupt' : 'none',
        saver: createSaver(storage, null),
      };
    case 'newer':
      return { state: fresh(), notice: 'newer', saver: createSaver(storage, null, 0, false) };
  }
}
