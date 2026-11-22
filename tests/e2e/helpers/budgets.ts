// Scene budgets the world shots check (SPEC §12.4 caps the game at 30 draw calls and 300 particles). The world's
// measured budget and its history live with the screenshot matrix (specs/screens.spec.ts); specs that shoot the world
// share these numbers instead of copying them.

/** Draw calls of a world shot (M0–M2a scene; raise only with the reason in screens.spec.ts). */
export const MAX_DRAW_CALLS = 14;
/** The game's draw-call cap (SPEC §12.4); specs of one scene check the measured MAX_DRAW_CALLS instead. */
export const SPEC_MAX_DRAW_CALLS = 30;
/** Live particles (SPEC §12.4). */
export const PARTICLE_BUDGET = 300;
