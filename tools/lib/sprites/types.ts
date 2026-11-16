// Generator contract for `pnpm sprites` (plan M0-08, ADR 004). Each `assets-src/gen/**/index.ts` default-exports
// one SpriteGenerator. Generators write ramp indices, never RGB, so palette conformance holds by construction.
import type { IndexBuffer, RampName } from './buffer.ts';

export type { IndexBuffer, RampName } from './buffer.ts';

export interface Size {
  readonly w: number;
  readonly h: number;
}

export interface GeneratorParams {
  /** Animation name (a key of `frames`). */
  readonly anim: string;
  /** Frame number within the animation, from 0. */
  readonly frame: number;
  /** Empty (transparent) buffer of the declared `size`; writes outside it throw. */
  readonly buffer: IndexBuffer;
  /** Number of colors in `ramp` (shades run 0 … size − 1). */
  readonly rampSize: (ramp: RampName) => number;
}

export interface SpriteGenerator {
  /** Atlas the frames go to (`public/atlases/<atlas>.png|json`); `fx` alone may use soft alpha. */
  readonly atlas: string;
  /** Entity name: the first segment of frame names `<entity>/<anim>/<nn>`. */
  readonly id: string;
  /** Maximum frame size in px. */
  readonly size: Size;
  /** Animation name → frame count. */
  readonly frames: Readonly<Record<string, number>>;
  /** Texture anchor (default bottom-centre: pivot at feet/base for Y-sorting). */
  readonly anchor?: { readonly x: number; readonly y: number };
  /** Draws one frame. `rng` is seeded per frame from `<atlas>:<entity>/<anim>/<nn>`, so output is deterministic. */
  generate(rng: () => number, params: GeneratorParams): void;
}
