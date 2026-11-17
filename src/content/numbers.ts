// Number limits of the economy (plan M1-01). Data only: the core reads them.

/**
 * Largest |exponent| a `Big` may hold (|log10| ≤ this). Below ~9e15 break_eternity keeps a value at layer 1 and prints
 * it as `XeY`, which `Big.fromString` accepts again — so every value the game holds round-trips through a save. The
 * economy never comes near it (late-game sums are ~1e300); going past it is a bug and throws.
 */
export const BIG_MAX_EXPONENT = 1e15;
