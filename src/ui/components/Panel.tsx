// The bottom panel (SPEC §6.1): tabs Хутір / Січ / Ще, the buy amount (×1 / ×10 / ×25 / MAX, shared by every row)
// and the list. The swipeable three-state bottom sheet comes later; here the panel has one fixed height. Choosing
// «Хутір» or «Січ» also takes the camera to that zone (SPEC §6.1, M2-02) through `onZone`; the other way round, the tab
// follows the camera where it settles (`zoneSource`) — without moving the camera again, moving focus, or leaving «Ще».
import { useEffect, useId, useState, type KeyboardEvent } from 'react';
import type { ZoneId } from '../../content/villages/khortytsia.layout.ts';
import { BUY_MODES } from '../../content/economy.ts';
import { LANGS } from '../../core/state.ts';
import type { BuyMode } from '../../core/economy.ts';
import { villageOf } from '../../core/modifiers.ts';
import { visibleSichIds } from '../../core/selectors.ts';
import { useAct, useGame } from '../hooks/useGame.ts';
import { useText } from '../hooks/useText.ts';
import { FarmRow, HireRow, SichRow } from './Rows.tsx';
import styles from './Panel.module.css';

const TABS = ['farm', 'sich', 'more'] as const;
type Tab = (typeof TABS)[number];
/** The world zone a tab shows (`more` has none). */
export type TabZone = Exclude<Tab, 'more'>;
/** The tab of a world zone: the suburb's buildings are in the farm list. */
const TAB_OF_ZONE: Record<ZoneId, TabZone> = { farm: 'farm', suburb: 'farm', sich: 'sich' };

export interface PanelProps {
  /** A tab was chosen: take the camera to its zone. */
  readonly onZone?: (zone: TabZone) => void;
  /** Subscribes to the zone the camera settles in (called with the current one at once); returns the unsubscribe. */
  readonly zoneSource?: ((listener: (zone: ZoneId) => void) => () => void) | undefined;
}

function sameIds(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

function ModePicker({ mode, onChange }: { mode: BuyMode; onChange: (m: BuyMode) => void }) {
  const { t } = useText();
  return (
    <div className={styles.modes} role="group" aria-label={t('ui.buy.modes')}>
      {BUY_MODES.map((m) => (
        <button
          key={m}
          type="button"
          className={styles.mode}
          aria-pressed={m === mode}
          onClick={() => {
            onChange(m);
          }}
        >
          {m === 'max' ? t('ui.buy.max') : t('ui.buy.times', { n: m })}
        </button>
      ))}
    </div>
  );
}

function FarmList({ mode }: { mode: BuyMode }) {
  const ids = useGame((s) => villageOf(s).buildings.map((b) => b.id), sameIds);
  return (
    <ul className={styles.list}>
      {ids.map((id) => (
        <FarmRow key={id} id={id} mode={mode} />
      ))}
    </ul>
  );
}

function SichList({ mode }: { mode: BuyMode }) {
  const ids = useGame(visibleSichIds, sameIds);
  return (
    <ul className={styles.list}>
      <HireRow />
      {ids.map((id) => (
        <SichRow key={id} id={id} mode={mode} />
      ))}
    </ul>
  );
}

function Settings() {
  const { t, lang } = useText();
  const act = useAct();
  return (
    <section className={styles.settings}>
      <h2 className={styles.title}>{t('ui.settings.title')}</h2>
      <div className={styles.modes} role="group" aria-label={t('ui.settings.lang')}>
        {LANGS.map((l) => (
          <button
            key={l}
            type="button"
            className={styles.mode}
            lang={l}
            aria-pressed={l === lang}
            onClick={() => {
              act({ type: 'setSettings', lang: l });
            }}
          >
            {t(`lang.${l}`)}
          </button>
        ))}
      </div>
    </section>
  );
}

export function Panel({ onZone, zoneSource }: PanelProps) {
  const [tab, setTab] = useState<Tab>('farm');
  useEffect(
    () =>
      zoneSource?.((zone) => {
        setTab((current) => (current === 'more' ? current : TAB_OF_ZONE[zone]));
      }),
    [zoneSource],
  );
  const select = (next: Tab): void => {
    setTab(next);
    if (next !== 'more') onZone?.(next);
  };
  const [mode, setMode] = useState<BuyMode>(1);
  const { t } = useText();
  const base = useId();
  // WAI-ARIA tabs: one tab in the Tab order (roving tabindex), arrows move between them, Home/End to the ends.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    const i = TABS.indexOf(tab);
    const n = TABS.length;
    const to: Partial<Record<string, number>> = {
      ArrowRight: (i + 1) % n,
      ArrowLeft: (i - 1 + n) % n,
      Home: 0,
      End: n - 1,
    };
    const index = to[e.key];
    if (index === undefined) return;
    e.preventDefault();
    const next = TABS[index] ?? tab;
    select(next);
    document.getElementById(`${base}-tab-${next}`)?.focus();
  };
  return (
    <section className={styles.panel}>
      <div className={styles.tabs} role="tablist" aria-label={t('ui.tabs')} onKeyDown={onKeyDown}>
        {TABS.map((id) => (
          <button
            key={id}
            id={`${base}-tab-${id}`}
            type="button"
            role="tab"
            className={styles.tab}
            aria-selected={id === tab}
            aria-controls={`${base}-panel`}
            tabIndex={id === tab ? 0 : -1}
            onClick={() => {
              select(id);
            }}
          >
            {t(`ui.tab.${id}`)}
          </button>
        ))}
      </div>
      <div
        id={`${base}-panel`}
        role="tabpanel"
        aria-labelledby={`${base}-tab-${tab}`}
        tabIndex={0}
        className={styles.body}
      >
        {tab !== 'more' && <ModePicker mode={mode} onChange={setMode} />}
        <div className={styles.scroll}>
          {tab === 'farm' && <FarmList mode={mode} />}
          {tab === 'sich' && <SichList mode={mode} />}
          {tab === 'more' && <Settings />}
        </div>
      </div>
    </section>
  );
}
