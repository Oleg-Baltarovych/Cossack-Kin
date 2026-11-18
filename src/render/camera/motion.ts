// Camera motion (plan M2-02, SPEC §6.1): drag, inertia, glide, tap vs drag, double tap. Pure: no Pixi, no DOM, time
// passed in (ms). Positions are logical px; pointer x/y are screen logical px. The camera x stays fractional — render
// splits it into whole logical px + whole device px (camera.ts `split`), so every logical px stays a scale×scale block.
// Camera state is cosmetic render state, never GameState.
//
// Taps earn (SPEC §2.1), so a tap is reported at once and never waits. A double tap only *schedules* the centring:
// it starts `doubleTapMs` after the second tap if no third tap came — a burst of tapping never moves the camera.
import { CAMERA } from '../atmosphere/config.ts';
import { clampCamX, type CameraBounds } from '../camera.ts';

export interface CameraConfig {
  readonly slopPx: number;
  readonly velocityWindowMs: number;
  readonly maxSpeed: number;
  readonly friction: number;
  readonly stopSpeed: number;
  readonly glideMs: number;
  readonly doubleTapMs: number;
  readonly doubleTapSlopPx: number;
}

export interface CameraView {
  readonly bounds: CameraBounds;
  /** Visible width in logical px (a double tap centres on viewW / 2). */
  readonly viewW: number;
  /** «Менше руху»: glides become instant jumps, a fling does not coast. */
  readonly lessMotion: boolean;
}

/** One pointer event: `id` = pointerId, x/y in screen logical px, t in ms; `primary` = the first finger / the mouse. */
export interface PointerSample {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly t: number;
  readonly primary: boolean;
}

interface Sample {
  readonly x: number;
  readonly t: number;
}

export type CameraMode =
  | { readonly kind: 'still' }
  /** Finger down, not moved past the slop yet: the camera stays (a release here is a tap). */
  | { readonly kind: 'press'; readonly id: number; readonly x: number; readonly y: number }
  | {
      readonly kind: 'drag';
      readonly id: number;
      readonly grabX: number;
      readonly grabCam: number;
      readonly samples: readonly Sample[];
    }
  /** Inertia, analytic from t0: x(t) = from + v/k·(1 − e^(−k·(t − t0))) until `until`. */
  | { readonly kind: 'coast'; readonly from: number; readonly v: number; readonly t0: number; readonly until: number }
  | { readonly kind: 'glide'; readonly from: number; readonly to: number; readonly t0: number };

export interface CameraMotion {
  readonly x: number;
  readonly mode: CameraMode;
  /** The last tap and how many quick taps in a row ended with it (2 = a double tap). */
  readonly lastTap: { readonly x: number; readonly y: number; readonly t: number; readonly count: number } | null;
  /** A double tap's centring: glides to camera x `to` at `at` ms unless another tap (or a drag) comes first. */
  readonly pendingCentre: { readonly to: number; readonly at: number } | null;
}

export interface Release {
  readonly motion: CameraMotion;
  /** `null` = the gesture was a drag. Every tap is reported at once; `double` = the second of a pair. */
  readonly tap: { readonly double: boolean } | null;
}

const STILL: CameraMode = { kind: 'still' };

export function createMotion(x: number): CameraMotion {
  return { x, mode: STILL, lastTap: null, pendingCentre: null };
}

/** Advances a coast or a glide to `t` and starts a due double-tap centring; keeps the camera inside the bounds. */
export function step(m0: CameraMotion, t: number, view: CameraView, cfg: CameraConfig = CAMERA): CameraMotion {
  let m = m0;
  const due = m.pendingCentre;
  if (due && t >= due.at && m.mode.kind === 'still') {
    // From the deadline, not from this frame: the glide is the same at any frame rate.
    m = glideTo({ ...m, pendingCentre: null }, due.to, due.at, view, cfg);
  }
  const { mode } = m;
  if (mode.kind === 'coast') {
    const k = cfg.friction;
    const dt = Math.max(0, Math.min(t, mode.until) - mode.t0) / 1000;
    const raw = mode.from + (mode.v / k) * (1 - Math.exp(-k * dt));
    const x = clampCamX(raw, view.bounds);
    return { ...m, x, mode: x !== raw || t >= mode.until ? STILL : mode };
  }
  if (mode.kind === 'glide') {
    const u = (t - mode.t0) / cfg.glideMs;
    if (u >= 1) return { ...m, x: mode.to, mode: STILL };
    return { ...m, x: mode.from + (mode.to - mode.from) * easeInOutCubic(Math.max(0, u)) };
  }
  const x = clampCamX(m.x, view.bounds);
  return x === m.x ? m : { ...m, x };
}

/**
 * Finger down: catches a coast or glide where it is. While a finger is already down another non-primary pointer is
 * ignored (pinch is M2-03); a new *primary* press means the old one was lost (no up/cancel ever came): it replaces it.
 */
export function press(m0: CameraMotion, p: PointerSample, view: CameraView, cfg: CameraConfig = CAMERA): CameraMotion {
  const held = m0.mode.kind === 'press' || m0.mode.kind === 'drag';
  if (held && !p.primary) return m0;
  const m = step(held ? cancel(m0, p.t, view, cfg) : m0, p.t, view, cfg);
  return { ...m, mode: { kind: 'press', id: p.id, x: p.x, y: p.y } };
}

export function move(m: CameraMotion, p: PointerSample, view: CameraView, cfg: CameraConfig = CAMERA): CameraMotion {
  const { mode } = m;
  if (mode.kind === 'press' && mode.id === p.id) {
    if (Math.hypot(p.x - mode.x, p.y - mode.y) <= cfg.slopPx) return m;
    // The drag starts where the slop was crossed (no jump by the slop distance); it ends any tap run.
    const drag: CameraMode = { kind: 'drag', id: p.id, grabX: p.x, grabCam: m.x, samples: [{ x: p.x, t: p.t }] };
    return { ...m, mode: drag, lastTap: null, pendingCentre: null };
  }
  if (mode.kind === 'drag' && mode.id === p.id) {
    const x = clampCamX(mode.grabCam - (p.x - mode.grabX), view.bounds);
    return { ...m, x, mode: { ...mode, samples: recent(mode.samples, { x: p.x, t: p.t }, cfg) } };
  }
  return m;
}

export function release(m: CameraMotion, p: PointerSample, view: CameraView, cfg: CameraConfig = CAMERA): Release {
  const { mode } = m;
  if (mode.kind === 'press' && mode.id === p.id) {
    const last = m.lastTap;
    const quick =
      last !== null && p.t - last.t <= cfg.doubleTapMs && Math.hypot(p.x - last.x, p.y - last.y) <= cfg.doubleTapSlopPx;
    const count = quick ? last.count + 1 : 1;
    // The second tap schedules the centring; a third one (or a tap elsewhere) cancels it.
    const pendingCentre = count === 2 ? { to: m.x + p.x - view.viewW / 2, at: p.t + cfg.doubleTapMs } : null;
    const motion: CameraMotion = { ...m, mode: STILL, lastTap: { x: p.x, y: p.y, t: p.t, count }, pendingCentre };
    return { motion, tap: { double: count === 2 } };
  }
  if (mode.kind === 'drag' && mode.id === p.id) {
    const samples = recent(mode.samples, { x: p.x, t: p.t }, cfg);
    const first = samples[0];
    const last = samples[samples.length - 1];
    const dt = first && last ? last.t - first.t : 0;
    // Camera velocity is the opposite of the finger's (px/s), capped.
    const raw = first && last && dt > 0 ? (-(last.x - first.x) / dt) * 1000 : 0;
    const v = Math.max(-cfg.maxSpeed, Math.min(cfg.maxSpeed, raw));
    const settled: CameraMotion = { ...m, mode: STILL };
    if (view.lessMotion || Math.abs(v) <= cfg.stopSpeed) return { motion: settled, tap: null };
    const until = p.t + (Math.log(Math.abs(v) / cfg.stopSpeed) / cfg.friction) * 1000;
    return { motion: { ...settled, mode: { kind: 'coast', from: m.x, v, t0: p.t, until } }, tap: null };
  }
  return { motion: m, tap: null };
}

/** The pointer was lost (OS gesture, capture lost, blur, hidden page): stop where the camera is; no tap, no inertia. */
export function cancel(m: CameraMotion, t: number, view: CameraView, cfg: CameraConfig = CAMERA): CameraMotion {
  if (m.mode.kind === 'press' || m.mode.kind === 'drag')
    return { ...m, mode: STILL, lastTap: null, pendingCentre: null };
  return step(m, t, view, cfg);
}

/** Glides to camera x `target` (clamped) in `glideMs`; «менше руху» jumps at once. Drops a pending centring. */
export function glideTo(
  m0: CameraMotion,
  target: number,
  t: number,
  view: CameraView,
  cfg: CameraConfig = CAMERA,
): CameraMotion {
  const m = step({ ...m0, pendingCentre: null }, t, view, cfg);
  const to = clampCamX(target, view.bounds);
  if (view.lessMotion || to === m.x) return { ...m, x: to, mode: STILL };
  return { ...m, mode: { kind: 'glide', from: m.x, to, t0: t } };
}

/** Puts the camera at `x` (clamped) at once, stopping any motion. */
export function jumpTo(m: CameraMotion, x: number, view: CameraView): CameraMotion {
  return { ...m, x: clampCamX(x, view.bounds), mode: STILL, pendingCentre: null };
}

/**
 * Drops a scheduled double-tap centring. Hook for M2-13: a double tap on a building opens its sheet instead of moving
 * the camera — the tap listener calls this (through the world) when the tap hit a plot.
 */
export function skipCentre(m: CameraMotion): CameraMotion {
  return m.pendingCentre ? { ...m, pendingCentre: null } : m;
}

/** Whether the camera is still and nothing is scheduled (the moment the zone tab may follow it). */
export function isSettled(m: CameraMotion): boolean {
  return m.mode.kind === 'still' && m.pendingCentre === null;
}

/** Drag samples within the velocity window before `next`, plus `next`. */
function recent(samples: readonly Sample[], next: Sample, cfg: CameraConfig): readonly Sample[] {
  return [...samples.filter((s) => next.t - s.t <= cfg.velocityWindowMs), next];
}

function easeInOutCubic(u: number): number {
  return u < 0.5 ? 4 * u * u * u : 1 - ((-2 * u + 2) * (-2 * u + 2) * (-2 * u + 2)) / 2;
}
