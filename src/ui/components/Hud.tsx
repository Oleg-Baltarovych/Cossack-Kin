// The top HUD (SPEC §6.1): ducats and glory with their income, then the army and the land's state. Its height (safe
// area included) is the shared token `--hud-h` on the root (plan M2-13): the tier banner stands under it and the full
// bottom sheet reaches up to it. Every value has its icon from the UI atlas and its word (SPEC §6.8, plan M2-14).
import { memo, useLayoutEffect, useRef } from 'react';
import type { Big } from '../../core/big.ts';
import { hudView } from '../../core/selectors.ts';
import { sameView, useGame } from '../hooks/useGame.ts';
import { useCounter } from '../hooks/useCounter.ts';
import { useText } from '../hooks/useText.ts';
import { Icon } from './Icon.tsx';
import styles from './Hud.module.css';

/** The screen-reader twin: re-renders only when its formatted text changes (not on every tick of the amount). */
const FullValue = memo(function FullValue({ text }: { readonly text: string }) {
  return <span className={styles.exact}>{text}</span>;
});

/**
 * A currency amount (plan M2-26, SPEC §6.7): the number on screen rolls to a new amount (useCounter) and is hidden
 * from screen readers; its visually hidden twin gives the full value in the same format at once. `data-counter` is
 * where the coins fly (CoinFlight).
 */
function Amount({
  currency,
  value,
  format,
}: {
  readonly currency: 'ducats' | 'glory';
  readonly value: Big;
  readonly format: (v: Big) => string;
}) {
  const rolling = useCounter<HTMLSpanElement>(value, format);
  return (
    <>
      <span ref={rolling} className={styles.amount} data-counter={currency} aria-hidden="true" />
      <FullValue text={format(value)} />
    </>
  );
}

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
          <Amount currency="ducats" value={v.ducats} format={num} />
          <span className={styles.rate}>{t('ui.hud.perSec', { value: num(v.ducatsPerSec) })}</span>
        </p>
        <p className={styles.currency}>
          <span className={styles.label}>
            <Icon id="glory" />
            {t('ui.hud.glory')}
          </span>
          <Amount currency="glory" value={v.glory} format={num} />
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
