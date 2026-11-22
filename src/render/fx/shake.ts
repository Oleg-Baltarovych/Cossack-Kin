// The camera shake on a big event (plan M2-26, SPEC §6.7; tuning and the event list in content SHAKE): a vertical
// offset in whole logical px, alternating up and down every `stepMs` and fading from `px` to `minPx`, gone after `ms`. Pure
// (ms in): render/App.ts adds it to the upscale sprite's y, so the world moves on its own pixel grid; «менше руху»
// never starts one.
import { SHAKE } from '../../content/juice.ts';

export interface ShakeTuning {
  readonly px: number;
  readonly minPx: number;
  readonly ms: number;
  readonly stepMs: number;
}

/** The offset (logical px, + = down) `elapsedMs` after the shake began; 0 before it and from `ms` on. */
export function shakeOffset(elapsedMs: number, s: ShakeTuning = SHAKE): number {
  if (!(elapsedMs >= 0) || elapsedMs >= s.ms) return 0;
  const step = Math.floor(elapsedMs / s.stepMs);
  const steps = Math.ceil(s.ms / s.stepMs);
  const size = Math.max(s.minPx, Math.ceil(s.px * (1 - step / steps)));
  return step % 2 === 0 ? -size : size;
}
