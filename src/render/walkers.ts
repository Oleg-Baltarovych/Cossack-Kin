// Scripted walkers (plan ART-06 spike; full villager FSM is M2): a person walks a route back and forth, rests in idle
// at each end, faces the way they walk. Pure and driven only by animation seconds, so `?freeze=<s>` frames repeat.
// Frame counts and rates follow SPEC §6.4 / ART-06: walk 6 @10 fps, idle 4 @6 fps.
import type { Walker } from '../content/villages/khortytsia.layout.ts';

export const WALK_FRAMES = 6;
export const WALK_FPS = 10;
export const IDLE_FRAMES = 4;
export const IDLE_FPS = 6;

export interface WalkerPose {
  /** World x of the pivot, whole px. */
  readonly x: number;
  /** 1 = facing right (as drawn), −1 = mirrored. */
  readonly facing: 1 | -1;
  readonly anim: 'walk' | 'idle';
  readonly frame: number;
}

const mod = (a: number, n: number): number => ((a % n) + n) % n;
const cycle = (t: number, fps: number, frames: number): number => mod(Math.floor(t * fps), frames);

export function walkerPose(w: Walker, seconds: number): WalkerPose {
  const length = Math.abs(w.x1 - w.x0);
  const t = seconds + w.phase;
  if (length === 0 || w.speed <= 0) return { x: w.x0, facing: 1, anim: 'idle', frame: cycle(t, IDLE_FPS, IDLE_FRAMES) };
  const dir = w.x1 > w.x0 ? 1 : -1;
  const walk = length / w.speed;
  const leg = walk + w.rest;
  const p = mod(t, 2 * leg);
  const out = p < leg;
  const s = out ? p : p - leg;
  const facing = (out ? dir : -dir) as 1 | -1;
  const from = out ? w.x0 : w.x1;
  if (s < walk) {
    return { x: Math.round(from + facing * w.speed * s), facing, anim: 'walk', frame: cycle(s, WALK_FPS, WALK_FRAMES) };
  }
  return { x: out ? w.x1 : w.x0, facing, anim: 'idle', frame: cycle(s - walk, IDLE_FPS, IDLE_FRAMES) };
}
