// A 16×16 icon from the UI atlas (plan M2-14), drawn as a CSS sprite at whole `--px`. Always decorative: the text next
// to it says the same (SPEC §6.8 — never an icon or a colour alone), so it is hidden from assistive tech. While the
// atlas loads it keeps its 16-px box (no layout jump); if the atlas (or this frame) never comes, it draws `fallback` as
// short text (a price's currency) or nothing at all — never an empty hole before its text.
import { memo, useLayoutEffect, useRef, type RefObject } from 'react';
import { deviceSnap } from '../pixelSnap.ts';
import { useIconAtlas, type IconId } from '../icons.ts';
import styles from './Icon.module.css';

/** Moves the icon's box onto whole device px (`translate`: layout is untouched) on mount, resize, font load and parent resize. */
function useDeviceSnap(): RefObject<HTMLSpanElement | null> {
  const ref = useRef<HTMLSpanElement | null>(null);
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
  });
  return ref;
}

export const Icon = memo(function Icon({ id, fallback }: { readonly id: IconId; readonly fallback?: string }) {
  const atlas = useIconAtlas();
  const snapRef = useDeviceSnap();
  if (atlas === 'loading') return <span className={styles.icon} aria-hidden="true" data-icon={id} />;
  const f = atlas === 'failed' ? undefined : atlas.frames.get(id);
  if (atlas === 'failed' || !f)
    return fallback === undefined ? null : (
      <span className={styles.fallback} aria-hidden="true" data-icon-fallback={id}>
        {fallback}
      </span>
    );
  // The 18×18 frame (the icon in a 1-px transparent margin, so the scaled layer's soft edge never lies on the
  // outline row — art-director M2-14, 412@3.5) is cut at its natural size (whole css px, exact) and scaled by a transform: a `background-size` in
  // `--px` units is rounded to 1/64 css px by layout, which on a 3.5-dpr phone puts a 1-px seam through the icon.
  return (
    <span ref={snapRef} className={styles.icon} aria-hidden="true" data-icon={id}>
      <span
        className={styles.sprite}
        style={{
          backgroundImage: `url("${atlas.url}")`,
          backgroundPosition: `${String(-f.x)}px ${String(-f.y)}px`,
        }}
      />
    </span>
  );
});
