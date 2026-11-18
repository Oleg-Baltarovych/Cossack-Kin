// Save storage (SPEC §9.4–9.5, rules/platform.md; plan M1-13). Two slots that the saver writes in turn; the web build
// keeps them in localStorage (Capacitor Preferences in M9, plan Q9). A storage that throws (quota, private mode,
// blocked) never crashes the game: a failed read is «no save», a failed write is reported to the caller.
import type { Slot } from '../core/save/load.ts';

export interface StorageService {
  load(slot: Slot): Promise<string | null>;
  /** Writes synchronously where the backend allows (localStorage), so a save on `pagehide` lands before unload. */
  save(slot: Slot, data: string): Promise<void>;
}

const KEY: Readonly<Record<Slot, string>> = { a: 'ck.save_a', b: 'ck.save_b' };

export function webStorage(store: Pick<Storage, 'getItem' | 'setItem'> = localStorage): StorageService {
  return {
    load(slot) {
      try {
        return Promise.resolve(store.getItem(KEY[slot]));
      } catch {
        return Promise.resolve(null);
      }
    },
    save(slot, data) {
      try {
        store.setItem(KEY[slot], data);
        return Promise.resolve();
      } catch (error) {
        return Promise.reject(error instanceof Error ? error : new Error(String(error)));
      }
    },
  };
}

/** In memory: debug presets (a screenshot state must not be saved over the player's game) and tests. */
export function memoryStorage(): StorageService {
  const slots = new Map<Slot, string>();
  return {
    load: (slot) => Promise.resolve(slots.get(slot) ?? null),
    save: (slot, data) => {
      slots.set(slot, data);
      return Promise.resolve();
    },
  };
}
