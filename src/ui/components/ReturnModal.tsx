// The return window (SPEC §3.8; plan M1-18): how long the player was away, whether the offline limit cut it, what the
// farm earned, and «Забрати». The income waits in the core's `returnReport` until claimed; the ×2 ad button arrives
// with ads (M8). A clock set back earns nothing and the window says why. Raids (M3-12, §0.1 П8) get one line, not a
// window of their own: how many squads are back with their regions — their chests wait on «Січ» — and, if some are
// still on the road, how many and when the first comes home (`raidSlotsView`; the report itself has no raids).
import { memo, useId } from 'react';
import type { RegionId } from '../../content/raids.ts';
import { raidSlotsView } from '../../core/raid-selectors.ts';
import type { GameState } from '../../core/state.ts';
import { formatReturnAt } from '../../i18n/index.ts';
import { useAct, useGame } from '../hooks/useGame.ts';
import { useText, type Text } from '../hooks/useText.ts';
import { regionName } from '../raidText.ts';
import { useFlightOrigin } from './CoinFlight.tsx';
import styles from './ReturnModal.module.css';

const selectReport = (s: GameState): GameState['returnReport'] => s.returnReport;

/** The squads back (their regions, slot order), how many are still away and the first of them home (ms), at `now`. */
interface RaidsNews {
  readonly back: readonly RegionId[];
  readonly away: number;
  readonly firstAt: number | null;
  readonly now: number;
  readonly tz: number;
}

function selectRaids(s: GameState): RaidsNews {
  const slots = raidSlotsView(s, s.time.lastSeen);
  const away = slots.flatMap((x) => (x.kind === 'running' ? [x.returnAt] : []));
  return {
    back: slots.flatMap((x) => (x.kind === 'returned' ? [x.region] : [])),
    away: away.length,
    firstAt: away.length > 0 ? Math.min(...away) : null,
    now: s.time.lastSeen,
    tz: s.settings.tzOffsetMin,
  };
}

/** Equal while the window would say the same (the clock moves `now`, not the words, until a squad comes home). */
const sameRaids = (a: RaidsNews, b: RaidsNews): boolean =>
  a.away === b.away && a.firstAt === b.firstAt && a.tz === b.tz && a.back.join() === b.back.join();

function RaidsLine({ text }: { text: Text }) {
  const r = useGame(selectRaids, sameRaids);
  if (r.back.length === 0 && r.away === 0) return null;
  return (
    <>
      {r.back.length > 0 && (
        <p data-return="raids">
          {text.t('return.raidsBack', {
            count: r.back.length,
            regions: r.back.map((id) => regionName(text, id)).join(text.t('ui.raids.listSep')),
          })}
        </p>
      )}
      {r.firstAt !== null && (
        <p data-return="raidsAway">
          {text.t('return.raidsAway', { count: r.away, back: formatReturnAt(text.lang, r.firstAt, r.now, r.tz) })}
        </p>
      )}
    </>
  );
}

export const ReturnModal = memo(function ReturnModal() {
  // The report object is replaced, never mutated: identity is the right equality.
  const report = useGame(selectReport, Object.is);
  const act = useAct();
  const withOrigin = useFlightOrigin();
  const text = useText();
  const { t, num, dur } = text;
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
          <RaidsLine text={text} />
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
