// Number limits of the economy (plan M1-01). Data only: the core reads them.

/**
 * Largest |exponent| a `Big` may hold (|log10| ≤ this). Below ~9e15 break_eternity keeps a value at layer 1 and prints
 * it as `XeY`, which `Big.fromString` accepts again — so every value the game holds round-trips through a save. The
 * economy never comes near it (late-game sums are ~1e300); going past it is a bug and throws.
 */
export const BIG_MAX_EXPONENT = 1e15;

/**
 * Largest |exponent| a save may hold (security review M1-04): far below BIG_MAX_EXPONENT, so a value that passes the
 * gate survives any arithmetic the game does on it — a crafted save near the Big limit would otherwise validate and
 * then throw on every load. The economy stays below ~1e300.
 */
export const SAVE_MAX_EXPONENT = 1e12;

/**
 * Save format limits (SPEC §9.5, rules/security.md): a save string longer than `maxChars` UTF-16 units is refused
 * before parsing (a v1 save is ~2 KB; 256 K leaves room for every later system).
 */
export const SAVE = { maxChars: 256 * 1024 } as const;
