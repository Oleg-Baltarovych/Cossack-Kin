// Which save to load from the two rotating slots (SPEC §9.5, rules/save.md; plan M1-13). Pure: the platform reads the
// raw strings, this decides. Both readable → the later one (by `lastSeen`); one damaged → the other, flagged; both
// damaged → a fresh game, flagged for the UI; a save from a newer game in either slot → stop: nothing may overwrite it.
import type { GameState } from '../state.ts';
import { decodeSave } from './serialize.ts';

export type Slot = 'a' | 'b';

export type LoadChoice =
  | { readonly kind: 'loaded'; readonly state: GameState; readonly slot: Slot; readonly fallback: boolean }
  | { readonly kind: 'fresh'; readonly reason: 'empty' | 'corrupt' }
  | { readonly kind: 'newer' };

export function chooseSave(a: string | null, b: string | null): LoadChoice {
  const da = a === null ? null : decodeSave(a);
  const db = b === null ? null : decodeSave(b);
  if ((da && !da.ok && da.reason === 'newer') || (db && !db.ok && db.reason === 'newer')) return { kind: 'newer' };
  const okA = da?.ok ? da.state : null;
  const okB = db?.ok ? db.state : null;
  if (okA && okB) {
    const slot: Slot = okB.time.lastSeen > okA.time.lastSeen ? 'b' : 'a';
    return { kind: 'loaded', state: slot === 'a' ? okA : okB, slot, fallback: false };
  }
  // One readable slot: a fallback when the other one exists but is damaged.
  if (okA) return { kind: 'loaded', state: okA, slot: 'a', fallback: db !== null };
  if (okB) return { kind: 'loaded', state: okB, slot: 'b', fallback: da !== null };
  return a === null && b === null ? { kind: 'fresh', reason: 'empty' } : { kind: 'fresh', reason: 'corrupt' };
}
