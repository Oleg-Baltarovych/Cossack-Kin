// FNV-1a 32 over the UTF-8 bytes of a string (SPEC §9.5; plan §0): a corruption check for saves, not an anti-cheat.
const OFFSET_BASIS = 0x811c9dc5;
const PRIME = 0x01000193;
const HEX = 16;
const HEX_DIGITS = 8;

const utf8 = new TextEncoder();

/** The hash as 8 lowercase hex digits. */
export function fnv1a32(text: string): string {
  let h = OFFSET_BASIS;
  for (const byte of utf8.encode(text)) h = Math.imul(h ^ byte, PRIME) >>> 0;
  return h.toString(HEX).padStart(HEX_DIGITS, '0');
}
