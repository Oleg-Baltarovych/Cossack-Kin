// The top HUD (SPEC §6.1): ducats and glory with their income, then the army and the land's state. Its height (safe
// area included) is the shared token `--hud-h` on the root (plan M2-13): the tier banner stands under it and the full
// bottom sheet reaches up to it. Every value has its icon from the UI atlas and its word (SPEC §6.8, plan M2-14).
import { memo, useLayoutEffect, useRef } from 'react';
import { hudView } from '../../core/selectors.ts';
import { sameView, useGame } from '../hooks/useGame.ts';
import { useText } from '../hooks/useText.ts';
import { Icon } from './Icon.tsx';
import styles from './Hud.module.css';

export const Hud = memo(function Hud() {
  const v = useGame(hudView, sameView);
  const { t, num } = useText();
  const ref = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const root = document.documentElement;
    const apply = (): void => {
      root.style.setProperty('--hud-h', `${String(el.offsetHeight)}px`);
    };
    apply();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(apply);
    observer?.observe(el);
    return () => {
      observer?.disconnect();
      root.style.removeProperty('--hud-h');
    };
  }, []);
  return (
    <header ref={ref} className={styles.hud}>
      <div className={styles.currencies}>
        <p className={styles.currency}>
          <span className={styles.label}>
            <Icon id="ducat" />
            {t('ui.hud.ducats')}
          </span>
          <span className={styles.amount} data-counter="ducats">
            {num(v.ducats)}
          </span>
          <span className={styles.rate}>{t('ui.hud.perSec', { value: num(v.ducatsPerSec) })}</span>
        </p>
        <p className={styles.currency}>
          <span className={styles.label}>
            <Icon id="glory" />
            {t('ui.hud.glory')}
          </span>
          <span className={styles.amount} data-counter="glory">
            {num(v.glory)}
          </span>
          <span className={styles.rate}>{t('ui.hud.perSec', { value: num(v.gloryPerSec) })}</span>
        </p>
      </div>
      <ul className={styles.stats}>
        <li>
          <Icon id="cossack" />
          {t('ui.hud.cossacks', { count: v.cossacks, max: v.maxCossacks })}
        </li>
        <li>
          <Icon id="kharch" />
          {t('ui.hud.kharch', { value: num(v.kharch) })}
        </li>
        <li>
          <Icon id="defence" />
          {t('ui.hud.defence', { value: num(v.defencePct) })}
        </li>
        <li>
          <Icon id={`wind-${v.wind}`} />
          {t('ui.hud.wind', { wind: t(`wind.${v.wind}`) })}
        </li>
      </ul>
    </header>
  );
});
