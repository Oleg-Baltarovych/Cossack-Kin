// What happened to the save (SPEC §9.5, rules/save.md: loading never fails silently): a damaged copy was replaced by
// the other one, both were damaged (a new game), or the save is from a newer game (update; nothing is saved). Shares
// the return window's look (ReturnModal.module.css).
import { useId } from 'react';
import type { BootNotice as Notice } from '../../platform/saves.ts';
import { useText } from '../hooks/useText.ts';
import styles from './ReturnModal.module.css';

export function BootNotice({ notice, onClose }: { notice: Exclude<Notice, 'none'> | 'none'; onClose: () => void }) {
  const { t } = useText();
  const titleId = useId();
  const bodyId = useId();
  if (notice === 'none') return null;
  return (
    <div className={styles.backdrop}>
      <section
        className={styles.dialog}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
      >
        <h2 id={titleId} className={styles.title}>
          {t(`boot.${notice}.title`)}
        </h2>
        <div id={bodyId} className={styles.body}>
          <p>{t(`boot.${notice}.body`)}</p>
        </div>
        {/* The only control: focused so Enter closes it. */}
        <button type="button" className={styles.claim} autoFocus onClick={onClose}>
          {t('boot.ok')}
        </button>
      </section>
    </div>
  );
}
