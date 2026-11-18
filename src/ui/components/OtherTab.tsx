// Screens shown instead of the game, outside any store (so in the default language): the game is open in another
// tab (platform/singleTab.ts), or it failed to start (main.tsx — a blank page would hide what happened).
import { START } from '../../content/economy.ts';
import { t } from '../../i18n/index.ts';
import styles from './ReturnModal.module.css';

function Screen({ kind }: { kind: 'tab.elsewhere' | 'start.error' }) {
  return (
    <div className={styles.backdrop}>
      <section className={styles.dialog} role="alertdialog" aria-labelledby="screen-title">
        <h2 id="screen-title" className={styles.title}>
          {t(START.lang, `${kind}.title`)}
        </h2>
        <div className={styles.body}>
          <p>{t(START.lang, `${kind}.body`)}</p>
        </div>
      </section>
    </div>
  );
}

export function OtherTab() {
  return <Screen kind="tab.elsewhere" />;
}

export function StartError() {
  return <Screen kind="start.error" />;
}
