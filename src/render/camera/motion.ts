// Camera motion (plan M2-02, SPEC §6.1): drag, inertia, glide, tap vs drag, double tap. Pure: no Pixi, no DOM, time
// passed in (ms). Positions are logical px; pointer x/y are screen logical px. The camera x stays fractional — render
// splits it into whole logical px + whole device px (camera.ts `split`), so every logical px stays a scale×scale block.
// Camera state is cosmetic render state, never GameState.
//
// Taps earn (SPEC §2.1), so a tap is reported at once and never waits. A double tap only *schedules* the centring:
// it starts `doubleTapMs` after the second tap if no third tap came — a burst of tapping never moves the camera.
//
// Pinch (M2-03, Q4): two integer zoom levels (normal, closer = scale + 1). The level changes at once when the finger
// distance crosses a ratio of a ratcheted base (the widest spread at the closer level, the closest at the normal one;
// reset on a switch): a tween would need fractional scales and break the pixel grid. The world point under the fingers'
// midpoint at the pinch start stays under the midpoint (two fingers also pan), on both axes; y (camera row inside the
// normal frame) is 0 at the normal level. At the closer level a one-finger drag pans both axes (inertia: x only).
import { CAMERA } from '../atmosphere/config.ts';
import { clampCamX, type LevelView } from '../camera.ts';
import type { ZoomLevel } from '../viewport.ts';

export interface CameraConfig {
  readonly slopPx: number;
  readonly velocityWindowMs: number;
  readonly maxSpeed: number;
  readonly friction: number;
  readonly stopSpeed: number;
  readonly glideMs: number;
  readonly doubleTapMs: number;
  readonly doubleTapSlopPx: number;
  /** Finger distance ÷ distance at the pinch start (or the last level change) that goes one level closer… */
  readonly pinchInRatio: number;
  /** …and back to normal. */
  readonly pinchOutRatio: number;
  /** Below this finger distance (normal-level logical px) the ratio is not measured: the base waits for the fingers. */
  readonly pinchMinBasePx: number;
}

export interface CameraView {
  /** Both zoom levels (camera.ts `levelView`): scale, x bounds, visible width (a double tap centres on viewW / 2). */
  readonly levels: readonly [LevelView, LevelView];
  /** «Менше руху»: glides become instant jumps, a fling does not coast (level changes are instant anyway). */
  readonly lessMotion: boolean;
}

/**
 * One pointer event: `id` = pointerId, x/y in screen logical px *of the level on screen*, t in ms; `primary` = the
 * first finger / the mouse.
 */
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

/** A pinch finger in device px (independent of the level, which changes mid-gesture). */
interface Finger {
  readonly id: number;
  readonly x: number;
  readonly y: number;
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
      /** Vertical grab (closer level only moves y: maxY is 0 at the normal level). */
      readonly grabY: number;
      readonly grabCamY: number;
      readonly samples: readonly Sample[];
      /** The finger's last y (screen logical px), for a pinch that starts from this drag. */
      readonly y: number;
    }
  /** Two fingers: `base` = device-px distance the ratio is measured from; `anchor` = world px kept under the midpoint. */
  | {
      readonly kind: 'pinch';
      readonly a: Finger;
      readonly b: Finger;
      readonly base: number;
      readonly anchor: Point;
    }
  /** Inertia, analytic from t0: x(t) = from + v/k·(1 − e^(−k·(t − t0))) until `until`. */
  | { readonly kind: 'coast'; readonly from: number; readonly v: number; readonly t0: number; readonly until: number }
  | { readonly kind: 'glide'; readonly from: number; readonly to: number; readonly t0: number };

interface Point {
  readonly x: number;
  readonly y: number;
}

export interface CameraMotion {
  /** Camera x: world px at the left screen edge. */
  readonly x: number;
  /** Camera y: rows of the normal frame above the top screen edge (0 at the normal level). */
  readonly y: number;
  readonly level: ZoomLevel;
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
  return { x, y: 0, level: 0, mode: STILL, lastTap: null, pendingCentre: null };
}

/** The view of the level on screen. */
function here(view: CameraView, m: CameraMotion): LevelView {
  return view.levels[m.level];
}

function clampY(y: number, lv: LevelView): number {
  return Number.isFinite(y) ? Math.min(lv.maxY, Math.max(0, y)) : 0;
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
  const lv = here(view, m);
  const y = clampY(m.y, lv);
  if (y !== m.y) m = { ...m, y };
  if (mode.kind === 'coast') {
    const k = cfg.friction;
    const dt = Math.max(0, Math.min(t, mode.until) - mode.t0) / 1000;
    const raw = mode.from + (mode.v / k) * (1 - Math.exp(-k * dt));
    const x = clampCamX(raw, lv.bounds);
    return { ...m, x, mode: x !== raw || t >= mode.until ? STILL : mode };
  }
  if (mode.kind === 'glide') {
    const u = (t - mode.t0) / cfg.glideMs;
    if (u >= 1) return { ...m, x: mode.to, mode: STILL };
    return { ...m, x: mode.from + (mode.to - mode.from) * easeInOutCubic(Math.max(0, u)) };
  }
  const x = clampCamX(m.x, lv.bounds);
  return x === m.x ? m : { ...m, x };
}

/**
 * Finger down: catches a coast or glide where it is. A second (non-primary) finger while one is down starts a pinch:
 * no tap, no pending centring; a third is ignored. A new *primary* press means the old gesture was lost (no up/cancel
 * ever came): it replaces it.
 */
export function press(m0: CameraMotion, p: PointerSample, view: CameraView, cfg: CameraConfig = CAMERA): CameraMotion {
  const { mode } = m0;
  const held = mode.kind === 'press' || mode.kind === 'drag' || mode.kind === 'pinch';
  if (held && !p.primary) {
    if (mode.kind === 'pinch') return m0;
    const s = here(view, m0).scale;
    const firstX = mode.kind === 'press' ? mode.x : (mode.samples[mode.samples.length - 1]?.x ?? mode.grabX);
    const a: Finger = { id: mode.id, x: firstX * s, y: mode.y * s };
    const b: Finger = { id: p.id, x: p.x * s, y: p.y * s };
    const mid = midpoint(a, b);
    const pinch: CameraMode = {
      kind: 'pinch',
      a,
      b,
      base: distance(a, b),
      anchor: { x: m0.x + mid.x / s, y: m0.y + mid.y / s },
    };
    return { ...m0, mode: pinch, lastTap: null, pendingCentre: null };
  }
  const m = step(held ? cancel(m0, p.t, view, cfg) : m0, p.t, view, cfg);
  return { ...m, mode: { kind: 'press', id: p.id, x: p.x, y: p.y } };
}

export function move(m: CameraMotion, p: PointerSample, view: CameraView, cfg: CameraConfig = CAMERA): CameraMotion {
  const { mode } = m;
  if (mode.kind === 'press' && mode.id === p.id) {
    if (Math.hypot(p.x - mode.x, p.y - mode.y) <= cfg.slopPx) return m;
    // The drag starts where the slop was crossed (no jump by the slop distance); it ends any tap run.
    return { ...m, mode: grab(m, p.id, p.x, p.y, p.t), lastTap: null, pendingCentre: null };
  }
  if (mode.kind === 'drag' && mode.id === p.id) {
    const lv = here(view, m);
    const x = clampCamX(mode.grabCam - (p.x - mode.grabX), lv.bounds);
    const y = clampY(mode.grabCamY - (p.y - mode.grabY), lv);
    return { ...m, x, y, mode: { ...mode, samples: recent(mode.samples, { x: p.x, t: p.t }, cfg), y: p.y } };
  }
  if (mode.kind === 'pinch' && (mode.a.id === p.id || mode.b.id === p.id)) {
    const s = here(view, m).scale;
    const f: Finger = { id: p.id, x: p.x * s, y: p.y * s };
    const a = mode.a.id === p.id ? f : mode.a;
    const b = mode.b.id === p.id ? f : mode.b;
    const d = distance(a, b);
    let level = m.level;
    let base: number;
    if (mode.base < cfg.pinchMinBasePx * view.levels[0].scale) {
      base = d; // too close together to measure a ratio from: wait for the fingers
    } else if (m.level === 0 && d / mode.base >= cfg.pinchInRatio) {
      level = 1;
      base = d;
    } else if (m.level === 1 && d / mode.base <= cfg.pinchOutRatio) {
      level = 0;
      base = d;
    } else {
      // Ratchet: going back is measured from the widest (closer) or closest (normal) the fingers came.
      base = m.level === 1 ? Math.max(mode.base, d) : Math.min(mode.base, d);
    }
    const placed = place({ ...m, level }, mode.anchor, midpoint(a, b), view);
    return { ...placed, mode: { ...mode, a, b, base } };
  }
  return m;
}

/** A one-finger drag that grabs the world at screen logical (x, y) of the level on screen. */
function grab(m: CameraMotion, id: number, x: number, y: number, t: number): CameraMode {
  return { kind: 'drag', id, grabX: x, grabCam: m.x, grabY: y, grabCamY: m.y, samples: [{ x, t }], y };
}

/** One pinch finger is gone (lifted or lost): the other drags on from where it is (no jump, no tap). */
function handOver(m: CameraMotion, gone: number, t: number, view: CameraView): CameraMotion {
  const { mode } = m;
  if (mode.kind !== 'pinch') return m;
  const rest = mode.a.id === gone ? mode.b : mode.a;
  const s = here(view, m).scale;
  return { ...m, mode: grab(m, rest.id, rest.x / s, rest.y / s, t) };
}

/**
 * Switches to `level` at once (no tween: integer scales only), keeping the world point under the screen point `at`
 * (screen logical px of the level on screen) where the bounds allow. Desktop ctrl+wheel and `?zoom=1`. Ignored while a
 * finger or the mouse is down; drops any motion and a pending centring.
 */
export function zoomTo(m: CameraMotion, level: ZoomLevel, at: Point, view: CameraView): CameraMotion {
  const { kind } = m.mode;
  if (level === m.level || kind === 'press' || kind === 'drag' || kind === 'pinch') return m;
  const s = here(view, m).scale;
  const anchor = { x: m.x + at.x, y: m.y + at.y };
  return place({ ...m, level, mode: STILL, pendingCentre: null }, anchor, { x: at.x * s, y: at.y * s }, view);
}

/** Puts the camera so world point `anchor` lies under the device-px screen point `at` at level `m.level` (clamped). */
function place(m: CameraMotion, anchor: Point, at: Point, view: CameraView): CameraMotion {
  const lv = here(view, m);
  return { ...m, x: clampCamX(anchor.x - at.x / lv.scale, lv.bounds), y: clampY(anchor.y - at.y / lv.scale, lv) };
}

function midpoint(a: Finger, b: Finger): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function distance(a: Finger, b: Finger): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function release(m: CameraMotion, p: PointerSample, view: CameraView, cfg: CameraConfig = CAMERA): Release {
  const { mode } = m;
  if (mode.kind === 'press' && mode.id === p.id) {
    const last = m.lastTap;
    const quick =
      last !== null && p.t - last.t <= cfg.doubleTapMs && Math.hypot(p.x - last.x, p.y - last.y) <= cfg.doubleTapSlopPx;
    const count = quick ? last.count + 1 : 1;
    // The second tap schedules the centring; a third one (or a tap elsewhere) cancels it.
    const pendingCentre = count === 2 ? { to: m.x + p.x - here(view, m).viewW / 2, at: p.t + cfg.doubleTapMs } : null;
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
  if (mode.kind === 'pinch' && (mode.a.id === p.id || mode.b.id === p.id))
    return { motion: handOver(m, p.id, p.t, view), tap: null };
  return { motion: m, tap: null };
}

/**
 * Pointer `id` was lost (pointercancel, lost capture): a pinch hands over to the other finger as a drag; a press or a
 * drag of that pointer is cancelled (no tap, no inertia); any other pointer changes nothing.
 */
export function lose(
  m: CameraMotion,
  id: number,
  t: number,
  view: CameraView,
  cfg: CameraConfig = CAMERA,
): CameraMotion {
  const { mode } = m;
  if (mode.kind === 'pinch') return mode.a.id === id || mode.b.id === id ? handOver(m, id, t, view) : m;
  if ((mode.kind === 'press' || mode.kind === 'drag') && mode.id === id) return cancel(m, t, view, cfg);
  return m;
}

/** The pointer was lost (OS gesture, capture lost, blur, hidden page): stop where the camera is; no tap, no inertia. */
export function cancel(m: CameraMotion, t: number, view: CameraView, cfg: CameraConfig = CAMERA): CameraMotion {
  if (m.mode.kind === 'press' || m.mode.kind === 'drag' || m.mode.kind === 'pinch')
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
  const to = clampCamX(target, here(view, m).bounds);
  if (view.lessMotion || to === m.x) return { ...m, x: to, mode: STILL };
  return { ...m, mode: { kind: 'glide', from: m.x, to, t0: t } };
}

/** Puts the camera at `x` (clamped) at once, stopping any motion. */
export function jumpTo(m: CameraMotion, x: number, view: CameraView): CameraMotion {
  return { ...m, x: clampCamX(x, here(view, m).bounds), mode: STILL, pendingCentre: null };
}

/** Puts the camera y at `y` rows (clamped to the level's [0, maxY]) at once; x and any motion stay (M2-13 reveal). */
export function setY(m: CameraMotion, y: number, view: CameraView): CameraMotion {
  const next = clampY(y, here(view, m));
  return next === m.y ? m : { ...m, y: next };
}

/**
 * Drops a scheduled double-tap centring (M2-13): a (double) tap on a building opens its row instead of moving the
 * camera — App.ts `onUp` calls this when the released tap hit a plot.
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
