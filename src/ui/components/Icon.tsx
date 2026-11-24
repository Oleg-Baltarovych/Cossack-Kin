// A 16×16 icon from the UI atlas (plan M2-14), drawn as a CSS sprite at whole `--px`. Always decorative: the text next
// to it says the same (SPEC §6.8 — never an icon or a colour alone), so it is hidden from assistive tech. While the
// atlas loads it keeps its 16-px box (no layout jump); if the atlas (or this frame) never comes, it draws `fallback` as
// short text (a price's currency) or nothing at all — never an empty hole before its text.
import { memo } from 'react';
import { useDeviceSnap } from '../hooks/useDeviceSnap.ts';
import { useIconAtlas, type IconId } from '../icons.ts';
import styles from './Icon.module.css';

export const Icon = memo(function Icon({ id, fallback }: { readonly id: IconId; readonly fallback?: string }) {
  const atlas = useIconAtlas();
  const snapRef = useDeviceSnap([atlas]);
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
