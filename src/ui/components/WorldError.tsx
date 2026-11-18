// The world did not start (M2-04): its lazy chunk or Pixi init failed. The game itself runs on (HUD, panel, saves), so
// this is a small notice over the empty world with a retry, not a modal.
import { useText } from '../hooks/useText.ts';
import styles from './WorldError.module.css';

export function WorldError({ onRetry }: { onRetry: () => void }) {
  const { t } = useText();
  return (
    <div className={styles.notice} role="alert">
      <p className={styles.text}>{t('world.failed.body')}</p>
      <button type="button" className={styles.retry} onClick={onRetry}>
        {t('world.failed.retry')}
      </button>
    </div>
  );
}
