// Which save to load from the two rotating slots (SPEC §9.5, rules/save.md; plan M1-13). Pure: the platform reads the
// raw strings, this decides. Both readable → the later one (by `lastSeen`); one damaged → the other, flagged; both
// damaged → a fresh game, flagged for the UI; a save from a newer game (or one too large to read: it may be one) in
// either slot → stop: nothing may overwrite it. Equal `lastSeen` (a clock held back) → the higher write `seq`.
import type { GameState } from '../state.ts';
import { decodeSave, type DecodeResult } from './serialize.ts';

export type Slot = 'a' | 'b';

export type LoadChoice =
  | {
      readonly kind: 'loaded';
      readonly state: GameState;
      readonly slot: Slot;
      readonly fallback: boolean;
      /** The loaded save's write number: the saver continues after it. */
      readonly seq: number;
    }
  | { readonly kind: 'fresh'; readonly reason: 'empty' | 'corrupt' }
  | { readonly kind: 'newer' };

export function chooseSave(a: string | null, b: string | null): LoadChoice {
  const da = a === null ? null : decodeSave(a);
  const db = b === null ? null : decodeSave(b);
  const blocks = (d: DecodeResult | null): boolean =>
    d !== null && !d.ok && (d.reason === 'newer' || d.reason === 'tooLarge');
  if (blocks(da) || blocks(db)) return { kind: 'newer' };
  const okA = da?.ok ? da : null;
  const okB = db?.ok ? db : null;
  if (okA && okB) {
    const tA = okA.state.time.lastSeen;
    const tB = okB.state.time.lastSeen;
    const slot: Slot = tB > tA || (tB === tA && okB.seq > okA.seq) ? 'b' : 'a';
    const pick = slot === 'a' ? okA : okB;
    return { kind: 'loaded', state: pick.state, slot, fallback: false, seq: pick.seq };
  }
  // One readable slot: a fallback when the other one exists but is damaged.
  if (okA) return { kind: 'loaded', state: okA.state, slot: 'a', fallback: db !== null, seq: okA.seq };
  if (okB) return { kind: 'loaded', state: okB.state, slot: 'b', fallback: da !== null, seq: okB.seq };
  return a === null && b === null ? { kind: 'fresh', reason: 'empty' } : { kind: 'fresh', reason: 'corrupt' };
}
