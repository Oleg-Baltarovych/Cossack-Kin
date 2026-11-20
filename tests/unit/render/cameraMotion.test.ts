import { describe, expect, it } from 'vitest';
import { CAMERA } from '../../../src/render/atmosphere/config.ts';
import { cameraBounds, type LevelView } from '../../../src/render/camera.ts';
import {
  cancel,
  createMotion,
  glideTo,
  jumpTo,
  lose,
  move,
  press,
  release,
  setY,
  skipCentre,
  step,
  zoomTo,
  type CameraMotion,
  type CameraView,
} from '../../../src/render/camera/motion.ts';

// Plan M2-02 (SPEC §6.1): drag with inertia, world bounds, glide to a zone, «менше руху», tap vs drag, double tap.
// 390×844 @3 in a 1920-px world: normal ×3 (390 columns), closer ×4 (293 columns, 211 rows of vertical room).
const NORMAL: LevelView = { scale: 3, bounds: cameraBounds(1920, 390), viewW: 390, maxY: 0 };
const CLOSER: LevelView = { scale: 4, bounds: cameraBounds(1920, 293), viewW: 293, maxY: 211 };
const VIEW: CameraView = { levels: [NORMAL, CLOSER], lessMotion: false };
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

  it('setY (M2-13 reveal) moves the closer view up/down within [0, maxY] and keeps x; the normal level stays at 0', () => {
    const closer = { ...createMotion(600), level: 1 as const };
    expect(setY(closer, 54, VIEW)).toMatchObject({ x: 600, y: 54 });
    expect(setY(closer, 9999, VIEW).y).toBe(CLOSER.maxY);
    expect(setY(closer, -5, VIEW).y).toBe(0);
    expect(setY(createMotion(600), 54, VIEW).y).toBe(0);
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

// Plan M2-03 (SPEC §6.1, Q4): pinch switches between two integer zoom levels (normal ×3, closer ×4 here) at a
// finger-distance ratio; the world point between the fingers stays put (±1 logical px). Fingers are given in device
// px, as on the glass; the app hands motion.ts screen logical px of the level on screen at that moment.
describe('camera motion: pinch zoom', () => {
  const scaleOf = (m: CameraMotion): number => VIEW.levels[m.level].scale;
  const finger = (m: CameraMotion, id: number, dx: number, dy: number, t: number) => {
    const s = scaleOf(m);
    return { id, x: dx / s, y: dy / s, t, primary: id === 1 };
  };
  /** World px under a device-px screen point. */
  const worldAt = (m: CameraMotion, dx: number, dy: number) => ({ x: m.x + dx / scaleOf(m), y: m.y + dy / scaleOf(m) });
  /** Two fingers down at device x a and b on row y; then both move to a2/b2 in `steps` even moves. */
  function pinch(m0: CameraMotion, y: number, a: number, b: number, a2: number, b2: number, t0 = 0, steps = 5) {
    let m = press(m0, finger(m0, 1, a, y, t0), VIEW);
    m = press(m, finger(m, 2, b, y, t0 + 5), VIEW);
    for (let i = 1; i <= steps; i++) {
      const t = t0 + 5 + i * 16;
      m = move(m, finger(m, 1, a + ((a2 - a) * i) / steps, y, t), VIEW);
      m = move(m, finger(m, 2, b + ((b2 - b) * i) / steps, y, t), VIEW);
    }
    return { m, t: t0 + 5 + steps * 16 };
  }

  it('spreading two fingers past the ratio goes one level closer, keeping the point between them (±1 px)', () => {
    const start = createMotion(600);
    const before = worldAt(start, 600, 1200);
    const { m } = pinch(start, 1200, 450, 750, 600 - 200 * CAMERA.pinchInRatio, 600 + 200 * CAMERA.pinchInRatio);
    expect(m.level).toBe(1);
    const after = worldAt(m, 600, 1200);
    expect(Math.abs(after.x - before.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(after.y - before.y)).toBeLessThanOrEqual(1);
    expect(m.y).toBeGreaterThan(0);
  });

  it('below the ratio the level stays (two fingers only pan)', () => {
    const { m } = pinch(createMotion(600), 1200, 450, 750, 400, 700);
    expect(m.level).toBe(0);
    expect(m.y).toBe(0);
    expect(m.x).toBeCloseTo(600 + 50 / 3, 6); // the midpoint moved 50 device px left: the camera follows it
  });

  it('pinching in from the closer level goes back to normal: the point stays horizontally, y returns to 0', () => {
    const zoomed = pinch(createMotion(600), 1200, 450, 750, 300, 900).m;
    expect(zoomed.level).toBe(1);
    const lifted = release(
      release(zoomed, finger(zoomed, 1, 300, 1200, 200), VIEW).motion,
      finger(zoomed, 2, 900, 1200, 210),
      VIEW,
    ).motion;
    const before = worldAt(lifted, 600, 1000);
    const close = 300 * CAMERA.pinchOutRatio;
    const { m } = pinch(lifted, 1000, 600 - 150, 600 + 150, 600 - close / 2, 600 + close / 2, 300);
    expect(m.level).toBe(0);
    expect(m.y).toBe(0);
    expect(Math.abs(worldAt(m, 600, 1000).x - before.x)).toBeLessThanOrEqual(1);
  });

  it('one gesture switches at most once per crossing: spreading further at the closer level stays there', () => {
    const { m } = pinch(createMotion(600), 1200, 450, 750, 0, 1170, 0, 10);
    expect(m.level).toBe(1);
  });

  it('a pinch is never a tap and cancels a pending double-tap centring', () => {
    let m = release(press(createMotion(600), at(200, 0), VIEW), at(200, 20), VIEW).motion;
    m = release(press(m, at(200, 100), VIEW), at(200, 120), VIEW).motion;
    expect(m.pendingCentre).not.toBeNull();
    // Second finger lands before the first moved past the slop; they lift without moving.
    m = press(m, finger(m, 1, 600, 1200, 150), VIEW);
    m = press(m, finger(m, 2, 900, 1200, 160), VIEW);
    expect(m.pendingCentre).toBeNull();
    const up2 = release(m, finger(m, 2, 900, 1200, 200), VIEW);
    expect(up2.tap).toBeNull();
    const up1 = release(up2.motion, finger(up2.motion, 1, 600, 1200, 210), VIEW);
    expect(up1.tap).toBeNull();
    expect(step(up1.motion, 3000, VIEW).x).toBe(600);
  });

  it('lifting one finger hands the gesture to a one-finger drag with the other', () => {
    const { m: pinched, t } = pinch(createMotion(600), 1200, 450, 750, 300, 900);
    const handed = release(pinched, finger(pinched, 1, 300, 1200, t + 10), VIEW);
    expect(handed.tap).toBeNull();
    const x0 = handed.motion.x;
    // Finger 2 drags 80 device px left = 20 logical px at ×4: the camera follows exactly, no jump.
    let m = move(handed.motion, finger(handed.motion, 2, 860, 1200, t + 300), VIEW);
    expect(m.x).toBeCloseTo(x0 + 10, 6);
    m = move(m, finger(m, 2, 820, 1200, t + 600), VIEW);
    expect(m.x).toBeCloseTo(x0 + 20, 6);
    expect(m.level).toBe(1);
    expect(release(m, finger(m, 2, 820, 1200, t + 900), VIEW).tap).toBeNull();
  });

  it('a third finger is ignored; a cancel stops the pinch without a tap', () => {
    const { m: pinched, t } = pinch(createMotion(600), 1200, 450, 750, 300, 900);
    const third = press(pinched, finger(pinched, 3, 100, 100, t + 5), VIEW);
    expect(third).toEqual(pinched);
    const c = cancel(pinched, t + 10, VIEW);
    expect(c.mode.kind).toBe('still');
    expect(c.level).toBe(1);
  });

  it('the closer level respects the world bounds on both axes', () => {
    // At the right end of the world, low on the screen: x and y clamp to the closer level's range.
    const { m } = pinch(createMotion(NORMAL.bounds.maxX), 2500, 1000, 1160, 700, 1169);
    expect(m.level).toBe(1);
    expect(m.x).toBeLessThanOrEqual(CLOSER.bounds.maxX);
    expect(m.y).toBeLessThanOrEqual(CLOSER.maxY);
    const top = pinch(createMotion(0), 0, 100, 300, 0, 500).m;
    expect(top.level).toBe(1);
    expect(top.x).toBeGreaterThanOrEqual(0);
    expect(top.y).toBe(0);
  });

  it('zoomTo (ctrl+wheel, ?zoom=1) switches at once around a screen point, even without «менше руху»', () => {
    const m = zoomTo(createMotion(600), 1, { x: 200, y: 400 }, VIEW);
    expect(m.level).toBe(1);
    expect(m.mode.kind).toBe('still');
    expect(m.x + (200 * 3) / 4).toBeCloseTo(800, 6);
    expect(m.y + (400 * 3) / 4).toBeCloseTo(400, 6);
    expect(zoomTo(m, 0, { x: 10, y: 10 }, VIEW)).toMatchObject({ level: 0, y: 0 });
  });

  it('at the closer level a double tap centres on the closer view width', () => {
    let m = zoomTo(createMotion(600), 1, { x: 195, y: 422 }, VIEW);
    const x0 = m.x;
    m = release(press(m, at(100, 0), VIEW), at(100, 20), VIEW).motion;
    m = release(press(m, at(100, 100), VIEW), at(100, 120), VIEW).motion;
    expect(step(m, 120 + CAMERA.doubleTapMs + CAMERA.glideMs, VIEW).x).toBeCloseTo(x0 + 100 - 293 / 2, 6);
  });
});

// Review fixes (M2-03): ratcheted pinch base, minimum base, one lost finger, two-axis drag at the closer level.
describe('camera motion: pinch zoom, review fixes', () => {
  const scaleOf = (m: CameraMotion): number => VIEW.levels[m.level].scale;
  const finger = (m: CameraMotion, id: number, dx: number, dy: number, t: number) => {
    const s = scaleOf(m);
    return { id, x: dx / s, y: dy / s, t, primary: id === 1 };
  };
  /** Moves both fingers symmetrically around device x 600 (row 1200) through the given half-distances. */
  function spread(m0: CameraMotion, halves: readonly number[], t0 = 0) {
    const [first = 0, ...rest] = halves;
    let m = press(m0, finger(m0, 1, 600 - first, 1200, t0), VIEW);
    m = press(m, finger(m, 2, 600 + first, 1200, t0 + 5), VIEW);
    rest.forEach((h, i) => {
      const t = t0 + 21 + i * 16;
      m = move(m, finger(m, 1, 600 - h, 1200, t), VIEW);
      m = move(m, finger(m, 2, 600 + h, 1200, t), VIEW);
    });
    return m;
  }

  it('the base ratchets: spread to 3×, then pinch back to 0.8 of the peak → normal again', () => {
    const peak = 300;
    const closer = spread(createMotion(600), [100, 150, 200, 250, peak]);
    expect(closer.level).toBe(1);
    const back = spread(createMotion(600), [100, 150, 200, 250, peak, peak * CAMERA.pinchOutRatio]);
    expect(back.level).toBe(0);
    // Not yet at 0.85 of the peak.
    expect(spread(createMotion(600), [100, 200, peak, peak * 0.85]).level).toBe(1);
  });

  it('at the normal level the base follows the closest the fingers came', () => {
    // Close in first (to 60), then spread to 1.25 × 60: closer, though below 1.25 × the start distance.
    const m = spread(createMotion(600), [100, 80, 60, 60 * CAMERA.pinchInRatio]);
    expect(m.level).toBe(1);
  });

  it(`fingers closer than ${String(CAMERA.pinchMinBasePx)} px (normal-level logical) never switch the level`, () => {
    // 6 logical px apart (18 device px at ×3), spread fast: the ratio is huge but the base too small to measure from.
    const minHalf = (CAMERA.pinchMinBasePx * NORMAL.scale) / 2;
    const m = spread(createMotion(600), [9, 20, minHalf + 2, (minHalf + 2) * 1.1]);
    expect(m.level).toBe(0);
    // From a measurable base the same spread does switch.
    expect(spread(createMotion(600), [minHalf + 2, (minHalf + 2) * CAMERA.pinchInRatio]).level).toBe(1);
  });

  it('losing one finger of a pinch (cancel / lost capture) hands over to the other as a drag', () => {
    const m = spread(createMotion(600), [100, 200]);
    const lost = lose(m, 1, 200, VIEW);
    expect(lost.mode.kind).toBe('drag');
    const x0 = lost.x;
    const moved = move(lost, finger(lost, 2, 800 - 40, 1200, 300), VIEW);
    expect(moved.x).toBeCloseTo(x0 + 40 / scaleOf(lost), 6);
    // Losing the dragging finger (or a finger of a press) cancels outright: no tap, no inertia.
    const gone = lose(moved, 2, 310, VIEW);
    expect(gone.mode.kind).toBe('still');
    expect(release(gone, finger(gone, 2, 760, 1200, 320), VIEW).tap).toBeNull();
    expect(lose(createMotion(600), 7, 0, VIEW)).toEqual(createMotion(600));
  });

  it('at the closer level a one-finger drag pans both axes, clamped to [0, maxY]', () => {
    let m = zoomTo(createMotion(600), 1, { x: 195, y: 422 }, VIEW);
    const { x, y } = m;
    m = press(m, at(100, 0, 300), VIEW);
    m = move(m, at(100, 10, 300 + CAMERA.slopPx + 1), VIEW); // grabs here
    m = move(m, at(80, 50, 300 + CAMERA.slopPx + 41), VIEW);
    expect(m.x).toBeCloseTo(x + 20, 6);
    expect(m.y).toBeCloseTo(y - 40, 6);
    m = move(m, at(80, 90, 300 + CAMERA.slopPx + 1000), VIEW);
    expect(m.y).toBe(0);
    m = move(m, at(80, 120, -2000), VIEW);
    expect(m.y).toBe(CLOSER.maxY);
    // At the normal level a vertical drag never moves y.
    let n = press(createMotion(600), at(100, 0, 300), VIEW);
    n = move(n, at(100, 30, 400), VIEW);
    expect(n.y).toBe(0);
  });

  it('zoomTo the level on screen changes nothing', () => {
    const m = glideTo(createMotion(0), 900, 0, VIEW);
    expect(zoomTo(m, 0, { x: 10, y: 10 }, VIEW)).toBe(m);
  });
});
