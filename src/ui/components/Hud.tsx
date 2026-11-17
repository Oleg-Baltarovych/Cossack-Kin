// The top HUD (SPEC §6.1): ducats and glory with their income, then the army and the land's state.
import { memo } from 'react';
import { hudView } from '../../core/selectors.ts';
import { sameView, useGame } from '../hooks/useGame.ts';
import { useText } from '../hooks/useText.ts';
import styles from './Hud.module.css';

export const Hud = memo(function Hud() {
  const v = useGame(hudView, sameView);
  const { t, num } = useText();
  return (
    <header className={styles.hud}>
      <div className={styles.currencies}>
        <p className={styles.currency}>
          <span className={styles.label}>{t('ui.hud.ducats')}</span>
          <span className={styles.amount}>{num(v.ducats)}</span>
          <span className={styles.rate}>{t('ui.hud.perSec', { value: num(v.ducatsPerSec) })}</span>
        </p>
        <p className={styles.currency}>
          <span className={styles.label}>{t('ui.hud.glory')}</span>
          <span className={styles.amount}>{num(v.glory)}</span>
          <span className={styles.rate}>{t('ui.hud.perSec', { value: num(v.gloryPerSec) })}</span>
        </p>
      </div>
      <ul className={styles.stats}>
        <li>{t('ui.hud.cossacks', { count: v.cossacks, max: v.maxCossacks })}</li>
        <li>{t('ui.hud.kharch', { value: num(v.kharch) })}</li>
        <li>{t('ui.hud.defence', { value: num(v.defencePct) })}</li>
        <li>{t('ui.hud.wind', { wind: t(`wind.${v.wind}`) })}</li>
      </ul>
    </header>
  );
});
