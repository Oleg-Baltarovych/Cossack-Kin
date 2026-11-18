// The game is already open in another tab (platform/singleTab.ts): this one does not start it. No store here, so the
// text is in the default language.
import { START } from '../../content/economy.ts';
import { t } from '../../i18n/index.ts';
import styles from './ReturnModal.module.css';

export function OtherTab() {
  return (
    <div className={styles.backdrop}>
      <section className={styles.dialog} role="alertdialog" aria-labelledby="other-tab-title">
        <h2 id="other-tab-title" className={styles.title}>
          {t(START.lang, 'tab.elsewhere.title')}
        </h2>
        <div className={styles.body}>
          <p>{t(START.lang, 'tab.elsewhere.body')}</p>
        </div>
      </section>
    </div>
  );
}
