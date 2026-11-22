// A story beat's portrait (plan M2-25, Q14): the character's sprite from the `people` atlas at ×2 in a framed box,
// standing on the box's ground line. Decorative (the title and text say who it is): hidden from assistive tech. While
// the atlas loads, or if it never comes, the frame stands empty — the beat still reads.
import type { CSSProperties } from 'react';
import { PORTRAIT_MAX_PX, type PortraitId } from '../../content/story.ts';
import { usePortraits } from '../portraits.ts';
import styles from './StoryModal.module.css';

// Custom properties are not in CSSProperties' keys; the values are plain numbers for calc().
const BOX = { '--frame-w': PORTRAIT_MAX_PX.w, '--frame-h': PORTRAIT_MAX_PX.h } as CSSProperties;

export function Portrait({ id }: { readonly id: PortraitId }) {
  const atlas = usePortraits();
  const ready = atlas !== 'loading' && atlas !== 'failed' ? atlas : null;
  const f = ready?.frames.get(id);
  return (
    <span className={styles.portrait} style={BOX} aria-hidden="true" data-portrait={id}>
      {ready && f && (
        <span
          className={styles.sprite}
          style={{
            width: `${String(f.w)}px`,
            height: `${String(f.h)}px`,
            marginLeft: `${String(-f.w / 2)}px`,
            backgroundImage: `url("${ready.url}")`,
            backgroundPosition: `${String(-f.x)}px ${String(-f.y)}px`,
          }}
        />
      )}
    </span>
  );
}
