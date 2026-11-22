// The rolling HUD counter (plan M2-26, SPEC §6.7): a new amount rolls from the one on screen to it in COUNTER.lerpMs
// (ease-out), restarting from where the roll is on every change, so the 10 Hz ticks keep the ducats turning over
// smoothly. The element's text is written here, outside React (its children are not React's): a roll does not
// re-render the HUD, and a frame formats a number only when its shown digits change (`shownValue`), so most frames
// allocate nothing. The first amount and «менше руху» show the amount at once; an amount past the Number range too.
// The exact amount for screen readers is the caller's (Hud keeps it in a visually hidden twin), never this roll.
import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import { COUNTER } from '../../content/juice.ts';
import { Big } from '../../core/big.ts';
import { shownValue } from '../../i18n/index.ts';
import { lessMotion } from '../motion.ts';

interface Roll {
  el: HTMLElement | null;
  format: (v: Big) => string;
  target: Big;
  /** The roll in Number range: from `from` at `start` (performance.now ms) to `to`. */
  from: number;
  to: number;
  start: number;
  /** The number on screen now, and its `shownValue` (what the text says). */
  now: number;
  said: number;
  frame: number;
  tick: () => void;
}

const easeOut = (t: number): number => 1 - (1 - t) * (1 - t) * (1 - t);

function show(r: Roll, value: Big, n: number): void {
  r.now = n;
  r.said = shownValue(n);
  if (r.el) r.el.textContent = r.format(value);
}

function stop(r: Roll): void {
  if (r.frame !== 0) cancelAnimationFrame(r.frame);
  r.frame = 0;
}

/** Rolls the text of the element the returned ref is put on to `value`, formatted by `format` (keep it stable). */
export function useCounter<E extends HTMLElement>(value: Big, format: (v: Big) => string): RefObject<E | null> {
  const ref = useRef<E>(null);
  const roll = useRef<Roll | null>(null);
  if (roll.current === null) {
    const r: Roll = {
      el: null,
      format,
      target: value,
      from: 0,
      to: 0,
      start: 0,
      now: Number.NaN,
      said: Number.NaN,
      frame: 0,
      // Made once per counter: a frame allocates no closure.
      tick: () => {
        const t = (performance.now() - r.start) / COUNTER.lerpMs;
        if (t >= 1) {
          r.frame = 0;
          show(r, r.target, r.to);
          return;
        }
        const n = r.from + (r.to - r.from) * easeOut(Math.max(0, t));
        r.now = n;
        const said = shownValue(n);
        if (said !== r.said) {
          r.said = said;
          if (r.el) r.el.textContent = r.format(Big.from(n));
        }
        r.frame = requestAnimationFrame(r.tick);
      },
    };
    roll.current = r;
  }

  useLayoutEffect(() => {
    const r = roll.current;
    if (!r) return;
    r.el = ref.current;
    const to = value.toNumber();
    const formatChanged = r.format !== format;
    r.format = format;
    r.target = value;
    // The first amount, a new format (language), «менше руху» or a roll that cannot run in Number range: at once.
    if (Number.isNaN(r.now) || formatChanged || lessMotion() || !Number.isFinite(to) || !Number.isFinite(r.now)) {
      stop(r);
      r.to = to;
      show(r, value, to);
      return;
    }
    // Nothing new. A remount (StrictMode, a re-attached subtree) stopped the frame mid-roll: then `now` ≠ `to` and the
    // roll goes on from where it stood.
    if (to === r.to && (r.frame !== 0 || to === r.now)) return;
    r.from = r.now;
    r.to = to;
    r.start = performance.now();
    if (r.frame === 0) r.frame = requestAnimationFrame(r.tick);
  }, [value, format]);

  useEffect(
    () => () => {
      if (roll.current) stop(roll.current);
    },
    [],
  );
  return ref;
}
