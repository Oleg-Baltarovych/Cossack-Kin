// Domain events (SPEC §9.2; plan §0, M1-09): a discriminated union of plain data. The core returns them with every
// state change; the store forwards them to render and audio, which react but never write state. The union grows with
// the actions and systems that emit them (M1-10, M1-11, M1-12).
import type { WindLevel } from '../content/villages/khortytsia.ts';

export type GameEvent =
  /** The wind changed at time `at` (ms). */
  { readonly type: 'WindChanged'; readonly at: number; readonly from: WindLevel; readonly to: WindLevel };
