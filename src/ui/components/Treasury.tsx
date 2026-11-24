// «Ще → Скарбниця» (plan M3-12, SPEC §3.4, §10.3; §0.1 П5): the relic collection. A found relic shows its picture,
// name, bonus (`{value}` from the core) and a short fact (§16); an unfound one only its silhouette, «Невідома
// реліквія» and where to look — raids from the shortest tier that can find one. When the pity makes the next qualifying
// success certain, one line says «Старі козаки кажуть: реліквія близько» — the same fact the map card shows. Pictures
// are decorative: the words say everything (no state by picture or colour alone).
import { useId } from 'react';
import type { RelicId } from '../../content/relics.ts';
import { relicHint, relicsView, type RelicHintView, type RelicView } from '../../core/raid-selectors.ts';
import type { GameState } from '../../core/state.ts';
import { raidTier } from '../../core/systems/raids.ts';
import { sameView, useGame } from '../hooks/useGame.ts';
import { useText } from '../hooks/useText.ts';
import type { IconId } from '../icons.ts';
import { Icon } from './Icon.tsx';
import styles from './Treasury.module.css';

/** Every relic has its picture and its silhouette in the `ui` atlas (a new relic without them fails to compile). */
const SILHOUETTE: Readonly<Record<RelicId, IconId>> = {
  pernach: 'pernach-unknown',
  porokhivnytsia: 'porokhivnytsia-unknown',
};

const selectRelics = (s: GameState): readonly RelicView[] => relicsView(s);
const sameRelics = (a: readonly RelicView[], b: readonly RelicView[]): boolean =>
  a.length === b.length && a.every((x, i) => x.id === b[i]?.id && x.found === b[i].found && x.value === b[i].value);
const sameHint = (a: RelicHintView | null, b: RelicHintView | null): boolean =>
  a === null || b === null ? a === b : sameView(a, b);

export function Treasury() {
  const text = useText();
  const { t } = text;
  const headingId = useId();
  const relics = useGame(selectRelics, sameRelics);
  const hint = useGame(relicHint, sameHint);
  const found = relics.filter((r) => r.found).length;
  const where = hint ? t('ui.treasury.hint', { time: text.dur(raidTier(hint.fromTier).durationSec) }) : null;
  return (
    <section className={styles.treasury} aria-labelledby={headingId}>
      <h2 id={headingId} className={styles.title}>
        {t('ui.treasury.title')}
      </h2>
      <p className={styles.count}>
        {hint ? t('ui.treasury.count', { found, total: relics.length }) : t('ui.treasury.all')}
      </p>
      <ul className={styles.list} aria-label={t('ui.raids.relics')}>
        {relics.map((r) => (
          <li key={r.id} className={styles.relic} data-found={r.found ? '' : undefined}>
            <span className={styles.niche}>
              <Icon id={r.found ? r.id : SILHOUETTE[r.id]} big />
            </span>
            <div className={styles.text}>
              {r.found ? (
                <>
                  <p className={styles.name}>{t(r.nameKey)}</p>
                  <p>{t(r.textKey, { value: r.value })}</p>
                  <p className={styles.fact}>{t(r.factKey)}</p>
                </>
              ) : (
                <>
                  <p className={styles.unknown}>{t('ui.treasury.unknown')}</p>
                  {where !== null && <p className={styles.fact}>{where}</p>}
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
      {hint?.near === true && <p className={styles.near}>{t('ui.map.relicSure')}</p>}
    </section>
  );
}
