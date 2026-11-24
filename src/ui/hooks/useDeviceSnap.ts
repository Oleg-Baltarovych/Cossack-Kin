// Keeps a pixel-art box (a CSS sprite scaled by whole `--px`) on whole device px (plan M2-14 icons; M3-11 raid map):
// layout puts boxes on 1/64 css px, and at a fractional dpr a sprite starting between device px blurs or seams.
import { useLayoutEffect, useRef, type DependencyList, type RefObject } from 'react';
import { deviceSnap } from '../pixelSnap.ts';

/**
 * Moves the box onto whole device px (`translate`: layout is untouched) on mount, resize, font load and parent resize.
 * `deps`: what decides whether the ref'd element is in the page (it may appear only once an atlas arrived) or where it
 * stands — the listeners are set up again when one changes.
 */
export function useDeviceSnap<T extends HTMLElement = HTMLSpanElement>(deps: DependencyList): RefObject<T | null> {
  const ref = useRef<T | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const snap = (): void => {
      el.style.translate = '';
      const r = el.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const dx = deviceSnap(r.left, dpr);
      const dy = deviceSnap(r.top, dpr);
      if (dx !== 0 || dy !== 0) el.style.translate = `${String(dx)}px ${String(dy)}px`;
    };
    snap();
    const parent = el.parentElement;
    const observer = typeof ResizeObserver === 'undefined' || !parent ? null : new ResizeObserver(snap);
    if (parent) observer?.observe(parent);
    window.addEventListener('resize', snap);
    // The pixel font arriving moves the line boxes (vertical-align) without resizing the parent.
    const fonts = typeof document.fonts === 'undefined' ? null : document.fonts;
    fonts?.addEventListener('loadingdone', snap);
    let live = true;
    void fonts?.ready.then(() => {
      if (live) snap();
    });
    return () => {
      live = false;
      observer?.disconnect();
      window.removeEventListener('resize', snap);
      fonts?.removeEventListener('loadingdone', snap);
    };
    // The caller's deps say when the element can appear or move; the ref itself is stable.
  }, deps);
  return ref;
}
