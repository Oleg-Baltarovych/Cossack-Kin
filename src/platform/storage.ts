// Save storage (SPEC §9.4–9.5, rules/platform.md; plan M1-13). Two slots that the saver writes in turn; the web build
// keeps them in localStorage (Capacitor Preferences in M9, plan Q9). A storage that throws (quota, private mode,
// blocked — even touching `localStorage` can throw) never crashes the game: a failed read rejects, so the boot can
// tell «cannot read» from «no save» and refuse to write over what it could not read; a failed write rejects too.
import type { Slot } from '../core/save/load.ts';

export interface StorageService {
  /** The slot's text, `null` = empty; rejects when the storage cannot be read. */
  load(slot: Slot): Promise<string | null>;
  save(slot: Slot, data: string): Promise<void>;
  /** Keeps a copy of damaged saves next to the slots, once, before a fresh game writes over them. */
  backup(slot: Slot, data: string): Promise<void>;
}

const KEY: Readonly<Record<Slot, string>> = { a: 'ck.save_a', b: 'ck.save_b' };
const BACKUP: Readonly<Record<Slot, string>> = { a: 'ck.save_damaged_a', b: 'ck.save_damaged_b' };

type KeyValue = Pick<Storage, 'getItem' | 'setItem'>;

export function webStorage(open: () => KeyValue = () => localStorage): StorageService {
  const attempt = <T>(run: (store: KeyValue) => T): Promise<T> => {
    try {
      return Promise.resolve(run(open()));
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  };
  return {
    load: (slot) => attempt((s) => s.getItem(KEY[slot])),
    // Synchronous on the web: a save on `pagehide` lands before unload.
    save: (slot, data) =>
      attempt((s) => {
        s.setItem(KEY[slot], data);
      }),
    backup: (slot, data) =>
      attempt((s) => {
        if (s.getItem(BACKUP[slot]) === null) s.setItem(BACKUP[slot], data);
      }),
  };
}

/** In memory: debug presets (a screenshot state must not be saved over the player's game) and tests. */
export function memoryStorage(): StorageService & { readonly backups: ReadonlyMap<Slot, string> } {
  const slots = new Map<Slot, string>();
  const backups = new Map<Slot, string>();
  return {
    backups,
    load: (slot) => Promise.resolve(slots.get(slot) ?? null),
    save: (slot, data) => {
      slots.set(slot, data);
      return Promise.resolve();
    },
    backup: (slot, data) => {
      if (!backups.has(slot)) backups.set(slot, data);
      return Promise.resolve();
    },
  };
}
