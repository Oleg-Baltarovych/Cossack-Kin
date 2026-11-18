// Save encoding (SPEC §9.5, rules/save.md, rules/security.md; plan M1-13). A save is the JSON envelope
// `{ version, checksum, payload }` where `payload` is the state's JSON as a string (Big → its save string) and
// `checksum` = FNV-1a 32 of that string. Decoding treats its input as hostile: size cap → JSON.parse → exact envelope
// → checksum → version (newer = refuse, the player must update) → migration chain → `validateState`. It never throws.
import { SAVE } from '../../content/numbers.ts';
import { STATE_VERSION, validateState, type GameState } from '../state.ts';
import { fnv1a32 } from './checksum.ts';
import { migrate } from './migrations/index.ts';

/** The persisted shape's version: the state's version (a save change bumps both, rules/save.md). */
export const SAVE_VERSION = STATE_VERSION;

export type DecodeFailure =
  /** Longer than SAVE.maxChars: refused unread. */
  | 'tooLarge'
  /** Not JSON. */
  | 'json'
  /** Not exactly `{ version, checksum, payload }` of the right types. */
  | 'envelope'
  /** The payload does not match its checksum (a damaged slot). */
  | 'checksum'
  /** Written by a newer game: never load or overwrite it. */
  | 'newer'
  /** Older than any version this game knows, or a hole in the migration chain. */
  | 'migration'
  /** The payload is not a valid state (validateState). */
  | 'invalid';

export type DecodeResult =
  { readonly ok: true; readonly state: GameState } | { readonly ok: false; readonly reason: DecodeFailure };

const FIRST_VERSION = 1;
const ENVELOPE_KEYS = ['checksum', 'payload', 'version'];

export function encodeSave(state: GameState): string {
  const payload = JSON.stringify(state);
  return JSON.stringify({ version: SAVE_VERSION, checksum: fnv1a32(payload), payload });
}

function parse(text: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false };
  }
}

export function decodeSave(raw: string): DecodeResult {
  if (raw.length > SAVE.maxChars) return { ok: false, reason: 'tooLarge' };
  const outer = parse(raw);
  if (!outer.ok) return { ok: false, reason: 'json' };
  const env = outer.value;
  if (env === null || typeof env !== 'object' || Array.isArray(env)) return { ok: false, reason: 'envelope' };
  // Own keys only, exactly the three: a crafted `__proto__` key is an own property after JSON.parse.
  const keys = Object.keys(env).sort();
  if (keys.length !== ENVELOPE_KEYS.length || keys.some((k, i) => k !== ENVELOPE_KEYS[i]))
    return { ok: false, reason: 'envelope' };
  const { version, checksum, payload } = env as Record<string, unknown>;
  if (typeof version !== 'number' || !Number.isInteger(version) || typeof checksum !== 'string')
    return { ok: false, reason: 'envelope' };
  if (typeof payload !== 'string') return { ok: false, reason: 'envelope' };
  if (fnv1a32(payload) !== checksum) return { ok: false, reason: 'checksum' };
  if (version > SAVE_VERSION) return { ok: false, reason: 'newer' };
  if (version < FIRST_VERSION) return { ok: false, reason: 'migration' };
  const inner = parse(payload);
  if (!inner.ok) return { ok: false, reason: 'json' };
  const migrated = migrate(inner.value, version);
  if (!migrated.ok) return { ok: false, reason: 'migration' };
  const valid = validateState(migrated.value);
  return valid.ok ? { ok: true, state: valid.state } : { ok: false, reason: 'invalid' };
}

// --- export / import (SPEC §9.5: a base64 string for moving a game and for bug reports) ------------------------

const BYTE = 0xff;
const utf8 = new TextEncoder();
const fromUtf8 = new TextDecoder('utf-8', { fatal: true });

/** The save as base64 of its UTF-8 bytes (copy-paste safe). */
export function exportSave(state: GameState): string {
  let binary = '';
  for (const byte of utf8.encode(encodeSave(state))) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** The other way round; anything that is not a valid exported save is refused, never thrown. */
export function importSave(text: string): DecodeResult {
  // base64 is 4/3 of the bytes: a string past that bound cannot hold a save we would accept.
  if (text.length > Math.ceil((SAVE.maxChars * 4) / 3) + 4) return { ok: false, reason: 'tooLarge' };
  let raw: string;
  try {
    const binary = atob(text.trim());
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0) & BYTE);
    raw = fromUtf8.decode(bytes);
  } catch {
    return { ok: false, reason: 'json' };
  }
  return decodeSave(raw);
}
