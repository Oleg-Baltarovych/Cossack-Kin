import { describe, expect, it } from 'vitest';
import { CAMERA } from '../../../src/render/atmosphere/config.ts';
import { cameraBounds } from '../../../src/render/camera.ts';
import {
  cancel,
  createMotion,
  glideTo,
  jumpTo,
  move,
  press,
  release,
  skipCentre,
  step,
  type CameraMotion,
  type CameraView,
} from '../../../src/render/camera/motion.ts';

// Plan M2-02 (SPEC §6.1): drag with inertia, world bounds, glide to a zone, «менше руху», tap vs drag, double tap.
const VIEW: CameraView = { bounds: cameraBounds(1920, 390), viewW: 390, lessMotion: false };
const STILL: CameraView = { ...VIEW, lessMotion: true };
const MAX_X = 1920 - 390;

const at = (x: number, t: number, y = 400, id = 1, primary = id === 1) => ({ id, x, y, t, primary });

/**
 * Drags the finger from `x0` to `x1` in 10 even moves over `ms`; returns the motion before release and the end time.
 * The first move crosses the slop and the drag grabs there, so the camera follows the remaining 9/10 of the travel.
 */
function drag(m0: CameraMotion, x0: number, x1: number, t0: number, ms: number, view = VIEW) {
  let m = press(m0, at(x0, t0), view);
  for (let i = 1; i <= 10; i++) m = move(m, at(x0 + ((x1 - x0) * i) / 10, t0 + (ms * i) / 10), view);
  return { m, t: t0 + ms };
}

describe('camera motion: tap vs drag', () => {
  it('a press that moves less than the slop is a tap and never moves the camera', () => {
    let m = press(createMotion(600), at(200, 0), VIEW);
    m = move(m, at(200 + CAMERA.slopPx - 1, 30), VIEW);
    expect(m.x).toBe(600);
    const r = release(m, at(200 + CAMERA.slopPx - 1, 60), VIEW);
    expect(r.tap).toEqual({ double: false });
    expect(r.motion.x).toBe(600);
    expect(step(r.motion, 2000, VIEW).x).toBe(600);
  });

  it('a drag moves the camera opposite to the finger, without a jump at the slop', () => {
    let m = press(createMotion(600), at(200, 0), VIEW);
    m = move(m, at(210, 10), VIEW); // crosses the slop: the drag starts here
    expect(m.x).toBe(600);
    m = move(m, at(110, 200), VIEW);
    expect(m.x).toBe(700);
    const r = release(m, at(110, 400), VIEW);
    expect(r.tap).toBeNull();
  });

  it('a vertical move past the slop is not a tap either', () => {
    let m = press(createMotion(600), at(200, 0, 400), VIEW);
    m = move(m, at(200, 20, 400 + CAMERA.slopPx + 2), VIEW);
    expect(release(m, at(200, 40, 400 + CAMERA.slopPx + 2), VIEW).tap).toBeNull();
    expect(m.x).toBe(600);
    const small = move(press(createMotion(600), at(200, 0, 400), VIEW), at(200, 20, 400 + CAMERA.slopPx - 1), VIEW);
    expect(release(small, at(200, 40, 400 + CAMERA.slopPx - 1), VIEW).tap).toEqual({ double: false });
  });

  it('a second finger is ignored while the first one is down', () => {
    let m = press(createMotion(600), at(200, 0), VIEW);
    m = press(m, at(50, 5, 400, 2), VIEW);
    m = move(m, at(10, 10, 400, 2), VIEW);
    expect(m.x).toBe(600);
    expect(release(m, at(10, 20, 400, 2), VIEW).tap).toBeNull();
    expect(release(m, at(200, 30), VIEW).tap).toEqual({ double: false });
  });

  it('a lost press (no up ever came) is replaced by the next primary press', () => {
    let m = press(createMotion(600), at(200, 0), VIEW); // pointer 1 lost: no up, no cancel
    m = press(m, at(100, 500, 400, 3, true), VIEW);
    expect(m.mode).toEqual({ kind: 'press', id: 3, x: 100, y: 400 });
    expect(release(m, at(100, 520, 400, 3, true), VIEW).tap).toEqual({ double: false });
    // A lost drag: the camera stays where the finger left it, with no fling.
    const { m: dragged, t } = drag(createMotion(600), 300, 100, 0, 100);
    const replaced = press(dragged, at(50, t + 10, 400, 4, true), VIEW);
    expect(replaced.x).toBe(780);
    expect(step(release(replaced, at(50, t + 30, 400, 4, true), VIEW).motion, t + 1000, VIEW).x).toBe(780);
  });

  it('a cancelled pointer stops where it is: no tap, no inertia', () => {
    const { m, t } = drag(createMotion(600), 300, 100, 0, 100);
    const c = cancel(m, t, VIEW);
    expect(c.x).toBe(780);
    expect(step(c, t + 1000, VIEW).x).toBe(780);
  });
});

describe('camera motion: inertia', () => {
  it('a fling keeps going in the drag direction and stops within 1 s', () => {
    const { m, t } = drag(createMotion(600), 300, 100, 0, 100); // 2000 px/s finger → camera +x
    const r = release(m, at(100, t), VIEW);
    expect(r.motion.x).toBe(780);
    const later = step(r.motion, t + 100, VIEW);
    expect(later.x).toBeGreaterThan(780);
    const end = step(r.motion, t + 1000, VIEW);
    expect(end.mode.kind).toBe('still');
    expect(step(end, t + 5000, VIEW).x).toBe(end.x);
  });

  it('speed only decreases: every 50 ms covers less than the 50 ms before', () => {
    const { m, t } = drag(createMotion(600), 300, 100, 0, 100);
    let prev = release(m, at(100, t), VIEW).motion;
    let lastDelta = Infinity;
    expect(step(prev, t + 50, VIEW).x).toBeGreaterThan(prev.x);
    for (let ms = 50; ms <= 1000; ms += 50) {
      const next = step(prev, t + ms, VIEW);
      const delta = next.x - prev.x;
      expect(delta).toBeGreaterThanOrEqual(0);
      expect(delta).toBeLessThanOrEqual(lastDelta);
      lastDelta = delta;
      prev = next;
    }
    expect(lastDelta).toBe(0);
  });

  it('even the fastest fling has stopped after 1 s', () => {
    const { m, t } = drag(createMotion(100), 380, 0, 0, 20); // 19 000 px/s finger: capped at maxSpeed
    const r = release(m, at(0, t), VIEW);
    const end = step(r.motion, t + 1000, VIEW);
    expect(end.mode.kind).toBe('still');
    expect(end.x).toBeGreaterThan(r.motion.x);
    expect(end.x - r.motion.x).toBeLessThanOrEqual(CAMERA.maxSpeed / CAMERA.friction);
  });

  it('«менше руху»: a fling does not coast', () => {
    const { m, t } = drag(createMotion(600), 300, 100, 0, 100, STILL);
    const r = release(m, at(100, t), STILL);
    expect(r.motion.mode.kind).toBe('still');
    expect(step(r.motion, t + 1000, STILL).x).toBe(780);
  });

  it('frame-rate independent: one step to +700 ms = 16 ms or 33 ms frames (coast and glide)', () => {
    const { m, t } = drag(createMotion(600), 300, 100, 0, 100);
    const coast = release(m, at(100, t), VIEW).motion;
    const glide = glideTo(createMotion(0), 1000, t, VIEW);
    for (const start of [coast, glide]) {
      const once = step(start, t + 700, VIEW).x;
      for (const frame of [16, 33]) {
        let x = start;
        for (let ms = frame; ms < 700; ms += frame) x = step(x, t + ms, VIEW);
        expect(Math.abs(step(x, t + 700, VIEW).x - once)).toBeLessThan(1e-9);
      }
    }
  });

  it('a step before the motion started does not move the camera backwards', () => {
    const { m, t } = drag(createMotion(600), 300, 100, 0, 100);
    const coast = release(m, at(100, t), VIEW).motion;
    expect(step(coast, t - 50, VIEW).x).toBe(780);
    expect(step(glideTo(createMotion(0), 1000, 500, VIEW), 400, VIEW).x).toBe(0);
  });

  it('a release after the finger rested has no inertia', () => {
    const { m, t } = drag(createMotion(600), 300, 100, 0, 100);
    const rested = move(m, at(100, t + 200), VIEW);
    const r = release(rested, at(100, t + 300), VIEW);
    expect(step(r.motion, t + 1000, VIEW).x).toBe(780);
  });

  it('a press during the coast catches the camera where it is', () => {
    const { m, t } = drag(createMotion(600), 300, 100, 0, 100);
    const coast = release(m, at(100, t), VIEW).motion;
    const caught = press(coast, at(200, t + 100), VIEW);
    const x = step(coast, t + 100, VIEW).x;
    expect(x).toBeGreaterThan(800);
    expect(caught.x).toBe(x);
    expect(step(caught, t + 1000, VIEW).x).toBe(x);
  });
});

describe('camera motion: world bounds', () => {
  it('a drag never takes the camera past either edge', () => {
    const right = drag(createMotion(MAX_X - 50), 380, 0, 0, 1000).m;
    expect(right.x).toBe(MAX_X);
    const left = drag(createMotion(50), 0, 380, 0, 1000).m;
    expect(left.x).toBe(0);
  });

  it('a fling stops at the edge and never crosses it', () => {
    const { m, t } = drag(createMotion(150), 0, 140, 0, 50); // camera moving to −x fast
    let r = release(m, at(140, t), VIEW).motion;
    for (let ms = 16; ms <= 1200; ms += 16) {
      r = step(r, t + ms, VIEW);
      expect(r.x).toBeGreaterThanOrEqual(0);
    }
    expect(r.x).toBe(0);
    expect(r.mode.kind).toBe('still');
  });

  it('a glide target outside the world goes to the edge', () => {
    const m = glideTo(createMotion(0), 5000, 0, VIEW);
    expect(step(m, CAMERA.glideMs, VIEW).x).toBe(MAX_X);
    expect(jumpTo(createMotion(0), -40, VIEW).x).toBe(0);
  });
});

describe('camera motion: glide (tabs, double tap)', () => {
  it(`reaches the target in ${String(CAMERA.glideMs)} ms (≤ 600) with ease in-out`, () => {
    expect(CAMERA.glideMs).toBeLessThanOrEqual(600);
    const m = glideTo(createMotion(0), 1000, 100, VIEW);
    const quarter = step(m, 100 + CAMERA.glideMs / 4, VIEW).x;
    const half = step(m, 100 + CAMERA.glideMs / 2, VIEW).x;
    const threeQuarters = step(m, 100 + (CAMERA.glideMs * 3) / 4, VIEW).x;
    expect(quarter).toBeGreaterThan(0);
    expect(quarter).toBeLessThan(250); // slow start
    expect(half).toBeCloseTo(500, 6);
    expect(threeQuarters).toBeGreaterThan(750); // slow end
    const end = step(m, 100 + CAMERA.glideMs, VIEW);
    expect(end.x).toBe(1000);
    expect(end.mode.kind).toBe('still');
  });

  it('«менше руху»: the glide is an instant jump', () => {
    const m = glideTo(createMotion(0), 1000, 100, STILL);
    expect(m.x).toBe(1000);
    expect(step(m, 101, STILL).x).toBe(1000);
  });

  it('a press during a glide catches the camera where it is', () => {
    const m = glideTo(createMotion(0), 1000, 0, VIEW);
    const x = step(m, CAMERA.glideMs / 2, VIEW).x;
    const caught = press(m, at(200, CAMERA.glideMs / 2), VIEW);
    expect(caught.x).toBe(x);
    expect(step(caught, 5000, VIEW).x).toBe(x);
  });

  const tapRun = (m0: CameraMotion, x: number, times: readonly number[], view = VIEW) => {
    let m = m0;
    const doubles: boolean[] = [];
    for (const t of times) {
      const r = release(press(m, at(x, t), view), at(x, t + 20), view);
      doubles.push(r.tap?.double ?? false);
      m = r.motion;
    }
    return { m, doubles };
  };

  it('an isolated double tap centres the tapped point, after the double-tap window; both presses are taps', () => {
    const { m, doubles } = tapRun(createMotion(600), 304, [0, 150]);
    expect(doubles).toEqual([false, true]);
    const second = 170; // release time of the second tap
    expect(step(m, second + CAMERA.doubleTapMs - 1, VIEW).x).toBe(600); // waits for a possible third tap…
    const centred = 600 + 304 - 390 / 2;
    const mid = step(m, second + CAMERA.doubleTapMs + CAMERA.glideMs / 2, VIEW).x;
    expect(mid).toBeGreaterThan(600); // …then glides
    expect(mid).toBeLessThan(centred);
    expect(step(m, second + CAMERA.doubleTapMs + CAMERA.glideMs, VIEW).x).toBe(centred);
  });

  it('a burst of taps on one spot (tapping to earn) never moves the camera', () => {
    const { m, doubles } = tapRun(createMotion(600), 304, [0, 120, 240, 360, 480]);
    expect(doubles).toEqual([false, true, false, false, false]);
    let x = m;
    for (let t = 500; t <= 3000; t += 16) x = step(x, t, VIEW);
    expect(x.x).toBe(600);
  });

  it('slow or distant taps are single', () => {
    const slow = tapRun(createMotion(600), 200, [0, 20 + CAMERA.doubleTapMs + 1]);
    expect(slow.doubles).toEqual([false, false]);
    let m = release(press(createMotion(600), at(200, 0), VIEW), at(200, 20), VIEW).motion;
    m = press(m, at(200 + CAMERA.doubleTapSlopPx + 1, 100), VIEW);
    expect(release(m, at(200 + CAMERA.doubleTapSlopPx + 1, 120), VIEW).tap).toEqual({ double: false });
  });

  it('skipCentre (a double tap on a building, M2-13) keeps the camera', () => {
    const { m } = tapRun(createMotion(600), 304, [0, 150]);
    expect(step(skipCentre(m), 2000, VIEW).x).toBe(600);
  });

  it('«менше руху»: the double-tap centring is a jump at the end of the window', () => {
    const { m } = tapRun(createMotion(600), 304, [0, 150], STILL);
    expect(step(m, 170 + CAMERA.doubleTapMs, STILL).x).toBe(600 + 304 - 390 / 2);
  });

  it('a drag between two taps breaks the pair', () => {
    let m = release(press(createMotion(600), at(200, 0), VIEW), at(200, 20), VIEW).motion;
    m = drag(m, 200, 150, 50, 50).m;
    m = release(m, at(150, 100), VIEW).motion;
    const r = release(press(m, at(200, 150), VIEW), at(200, 170), VIEW);
    expect(r.tap).toEqual({ double: false });
  });
});
