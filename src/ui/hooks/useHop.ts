// A buy button hops once when it turns affordable (plan M2-26, SPEC §6.7): the hook marks the element
// (`data-hop`, CSS plays the hop) only on a change from off to on — never on mount, never on a re-render or a tick that
// keeps it on, never when the change came from switching the buy mode (`mode`: ×1 → ×10 is not «became affordable»),
// never under «менше руху», and never while the button is not rendered (the sheet collapsed: the list is
// `display: none`, and a mark set there would hop late, when the sheet opens). The mark goes on `animationend` (or when
// the button turns off), so the next turn hops again. No timers: nothing to clean up but the listeners.
import { useEffect, useRef, type RefObject } from 'react';
import { lessMotion } from '../motion.ts';

/** Whether `el` is rendered now (no `display: none` on it or above it); browsers without the API count as shown. */
function rendered(el: HTMLElement): boolean {
  // Older WebViews lack checkVisibility (Chrome 105+, Safari 17.4+): there the hop may play late, never wrongly.
  return typeof el.checkVisibility !== 'function' || el.checkVisibility();
}

export function useHop<E extends HTMLElement>(on: boolean, mode: unknown): RefObject<E | null> {
  const ref = useRef<E>(null);
  // The values of the first render: the first effect compares with them, so a button mounted affordable never hops.
  const last = useRef({ on, mode });

  useEffect(() => {
    const prev = last.current;
    last.current = { on, mode };
    const el = ref.current;
    if (!el) return;
    if (!on) {
      delete el.dataset['hop'];
      return;
    }
    if (prev.on || prev.mode !== mode || lessMotion() || !rendered(el)) return;
    el.dataset['hop'] = '';
  }, [on, mode]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const end = (e: Event): void => {
      if (e.target === el) delete el.dataset['hop'];
    };
    el.addEventListener('animationend', end);
    el.addEventListener('animationcancel', end);
    return () => {
      el.removeEventListener('animationend', end);
      el.removeEventListener('animationcancel', end);
    };
  }, []);

  return ref;
}
