// A story beat's portrait (plan M2-25, Q14): the character's sprite from the `people` atlas at ×2 in a framed box,
// standing on the box's ground line. Decorative (the title and text say who it is): hidden from assistive tech. While
// the atlas loads, or if it never comes, the frame stands empty — the beat still reads. `silhouette` (a hero who has
// not come, M4-12): the same frame as one flat ink shape — the sprite's alpha as a mask over a palette colour.
import type { CSSProperties } from 'react';
import { PORTRAIT_MAX_PX, type PortraitId } from '../../content/story.ts';
import { usePortraits } from '../portraits.ts';
import styles from './StoryModal.module.css';

// Custom properties are not in CSSProperties' keys; the values are plain numbers for calc().
const BOX = { '--frame-w': PORTRAIT_MAX_PX.w, '--frame-h': PORTRAIT_MAX_PX.h } as CSSProperties;

export function Portrait({ id, silhouette = false }: { readonly id: PortraitId; readonly silhouette?: boolean }) {
  const atlas = usePortraits();
  const ready = atlas !== 'loading' && atlas !== 'failed' ? atlas : null;
  const f = ready?.frames.get(id);
  return (
    <span
      className={styles.portrait}
      style={BOX}
      aria-hidden="true"
      data-portrait={id}
      data-silhouette={silhouette ? '' : undefined}
    >
      {ready && f && (
        <span
          className={silhouette ? [styles.sprite, styles.shade].join(' ') : styles.sprite}
          style={{
            width: `${String(f.w)}px`,
            height: `${String(f.h)}px`,
            marginLeft: `${String(-f.w / 2)}px`,
            ...(silhouette
              ? {
                  maskImage: `url("${ready.url}")`,
                  maskPosition: `${String(-f.x)}px ${String(-f.y)}px`,
                }
              : {
                  backgroundImage: `url("${ready.url}")`,
                  backgroundPosition: `${String(-f.x)}px ${String(-f.y)}px`,
                }),
          }}
        />
      )}
    </span>
  );
}
