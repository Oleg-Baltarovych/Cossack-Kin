// The bottom panel (SPEC §6.1): tabs Хутір / Січ / Ще, the buy amount (×1 / ×10 / ×25 / MAX, shared by every row)
// and the list. The swipeable three-state bottom sheet comes later; here the panel has one fixed height.
import { useId, useState, type KeyboardEvent } from 'react';
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

export function Panel() {
  const [tab, setTab] = useState<Tab>('farm');
  const [mode, setMode] = useState<BuyMode>(1);
  const { t } = useText();
  const base = useId();
  // WAI-ARIA tabs: one tab in the Tab order (roving tabindex), arrows move between them.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (step === 0) return;
    e.preventDefault();
    const next = TABS[(TABS.indexOf(tab) + step + TABS.length) % TABS.length] ?? tab;
    setTab(next);
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
              setTab(id);
            }}
          >
            {t(`ui.tab.${id}`)}
          </button>
        ))}
      </div>
      <div id={`${base}-panel`} role="tabpanel" aria-labelledby={`${base}-tab-${tab}`} className={styles.body}>
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
