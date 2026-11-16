// Generator contract for `pnpm sprites` (plan M0-08, ADR 004). Each `assets-src/gen/<atlas>/<entity>/index.ts`
// default-exports one SpriteGenerator (`assets-src/gen/lib/` is the shared generator library, not a generator).
// Generators write ramp indices, never RGB, so palette conformance holds by construction.
//
// Frame names (packed into `public/atlases/<atlas>.png|json`):
//   <entity>[.<variant>][@<layer>]/<anim>/<nn>
//   e.g. `swatch/idle/00`, `hut.t2/idle/00`, `hut.t2@emissive/idle/00`, `hut@shadow/idle/03`
// - `<variant>` (tier, land…) only when `variants` is declared; one full set of frames per variant.
// - `<layer>` only for companion layers: same size, anchor and frame count as the base frame, drawn into
//   `params.layers.<layer>` during the same `generate` call (emissive = night mask, art.md; shadow = ground shadow).
// - `<nn>` is the zero-padded frame number (00..99); Pixi `animations` list frames in that order under
//   `<entity>[.<variant>][@<layer>]/<anim>`.
// Every name segment matches /^[a-z][a-z0-9-]*$/, so `.`, `@` and `/` are unambiguous separators.
//
// Determinism: two `pnpm sprites` runs must give byte-identical atlases on every machine and Node version.
// Use only `rng` (seeded per frame), integer math and + − × ÷ on floats. Do NOT feed raw Math.sin / cos / exp /
// pow / cbrt / log results into output — their last bits are implementation-defined and differ between engines.
// Use integer/lattice noise (from `rng` or hashes) and lookup tables, or quantize such values coarsely (e.g. to
// 1/256) before they decide a shade or a px.
import type { IndexBuffer, RampName } from './buffer.ts';

export type { IndexBuffer, Normal, Pixel, PixelInput, RampName } from './buffer.ts';

export interface Size {
  readonly w: number;
  readonly h: number;
}

/** Companion layers a generator may draw next to the base frame. */
export const COMPANION_LAYERS = ['emissive', 'shadow'] as const;
export type CompanionLayer = (typeof COMPANION_LAYERS)[number];

export interface GeneratorParams {
  /** Variant name (one of `variants`), or `null` for a generator without variants. */
  readonly variant: string | null;
  /** Animation name (a key of `frames`). */
  readonly anim: string;
  /** Frame number within the animation, from 0. */
  readonly frame: number;
  /** Empty (transparent) base buffer of the declared `size`; writes outside it throw. */
  readonly buffer: IndexBuffer;
  /** Empty buffers (same size) for each declared companion layer. */
  readonly layers: Readonly<Partial<Record<CompanionLayer, IndexBuffer>>>;
  /** Number of colors in `ramp` (shades run 0 … size − 1). */
  readonly rampSize: (ramp: RampName) => number;
}

export interface SpriteGenerator {
  /** Atlas the frames go to (`public/atlases/<atlas>.png|json`); `fx` alone may use soft alpha. */
  readonly atlas: string;
  /** Entity name: the first segment of frame names. */
  readonly id: string;
  /** Maximum frame size in px. */
  readonly size: Size;
  /** Animation name → frame count (1..100). */
  readonly frames: Readonly<Record<string, number>>;
  /** Variants (tiers, lands…); each gets its own frames `<entity>.<variant>/…`. */
  readonly variants?: readonly string[];
  /** Companion layers drawn alongside each frame (`<entity>@<layer>/…`). */
  readonly layers?: readonly CompanionLayer[];
  /** Texture anchor (default bottom-centre: pivot at feet/base for Y-sorting). */
  readonly anchor?: { readonly x: number; readonly y: number };
  /** Draws one frame (all its layers). `rng` is seeded from `<atlas>:<base frame name>`. */
  generate(rng: () => number, params: GeneratorParams): void;
}
