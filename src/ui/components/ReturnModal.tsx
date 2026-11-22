// The return window (SPEC §3.8; plan M1-18): how long the player was away, whether the offline limit cut it, what the
// farm earned, and «Забрати». The income waits in the core's `returnReport` until claimed; the ×2 ad button arrives
// with ads (M8). A clock set back earns nothing and the window says why.
import { memo, useId } from 'react';
import type { GameState } from '../../core/state.ts';
import { useAct, useGame } from '../hooks/useGame.ts';
import { useText } from '../hooks/useText.ts';
import { useFlightOrigin } from './CoinFlight.tsx';
import styles from './ReturnModal.module.css';

const selectReport = (s: GameState): GameState['returnReport'] => s.returnReport;

export const ReturnModal = memo(function ReturnModal() {
  // The report object is replaced, never mutated: identity is the right equality.
  const report = useGame(selectReport, Object.is);
  const act = useAct();
  const withOrigin = useFlightOrigin();
  const { t, num, dur } = useText();
  const titleId = useId();
  const bodyId = useId();
  if (!report) return null;

  const earned = !report.ducats.isZero() || !report.glory.isZero();
  return (
    <div className={styles.backdrop}>
      <section
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
      >
        <h2 id={titleId} className={styles.title}>
          {t('return.title')}
        </h2>
        <div id={bodyId} className={[styles.body, styles.scroll].join(' ')}>
          {report.reason === 'clockBack' ? (
            <p>{t('return.clockBack')}</p>
          ) : (
            <>
              <p>{t('return.away', { time: dur(report.awaySec) })}</p>
              {report.capped && (
                <p className={styles.capped}>{t('return.capped', { counted: dur(report.countedSec) })}</p>
              )}
              {earned ? (
                <dl className={styles.gains}>
                  <div className={styles.gain}>
                    <dt>{t('ui.hud.ducats')}</dt>
                    <dd>{t('return.gain', { value: num(report.ducats) })}</dd>
                  </div>
                  {!report.glory.isZero() && (
                    <div className={styles.gain}>
                      <dt>{t('ui.hud.glory')}</dt>
                      <dd>{t('return.gain', { value: num(report.glory) })}</dd>
                    </div>
                  )}
                </dl>
              ) : (
                <p>{t('return.nothing')}</p>
              )}
            </>
          )}
        </div>
        <button
          type="button"
          className={styles.claim}
          // The only control in a modal dialog: focus it so Enter/Space claim at once.
          autoFocus
          onClick={(e) => {
            // The coins of a large return fly from here (M2-26).
            withOrigin(e.currentTarget, () => {
              act({ type: 'claimReturn' });
            });
          }}
        >
          {t('return.claim')}
        </button>
      </section>
    </div>
  );
});
