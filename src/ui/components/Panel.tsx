// The bottom sheet (SPEC §6.1, plan M2-13): tabs Хутір / Січ / Культура (M4-12) / Ще, the buy amount (×1 / ×10 / ×25 / MAX, shared by
// every row) and the list, in three states — collapsed (only the tab bar), half, full (up to the HUD). A drag on the
// bar snaps between them (ui/sheet.ts), the bar's button cycles them, Esc collapses. A tap on a building in the world
// (`reveal`) opens half with that building's row in view and lit; `onReveal` then lets the camera clear it. Choosing
// «Хутір» or «Січ» also takes the camera to that zone (SPEC §6.1, M2-02) through `onZone`; the other way round, the tab
// follows the camera where it settles (`zoneSource`) — without moving the camera again, moving focus, or leaving «Ще».
// Over the «Хутір»/«Січ» lists stands the one-line quest strip, «Ще» lists both quests (M2-25); a red dot on «Ще» marks
// a claim while the sheet is down; «Ще» also holds the «Скарбниця» of relics (M3-12). «Січ» opens on the «Походи» block (M3-09); its red dot marks a raid that is back.
// A tap on a quest's title (strip or «Ще», M3-15, SPEC §10.3) leads to core `questTarget`: its tab, the sheet at half,
// the row lit (a building, the hire row, a raid card) and the camera at the building (the reveal path) or the Sich;
// a counter with no row (taps, any purchase) shows a hint under the strip instead. Both are read out (role=status).
// «Культура» (M4-12, ADR 011) has no world zone: choosing it moves no camera, and the camera never takes the tab off
// it; it shares the strip and the picker (its heroes level by it); its red dot is core `cultureClaimable`.
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { SHEET } from '../../content/juice.ts';
import type { SichUnlock } from '../../content/sich.ts';
import type { PlotBuilding } from '../../content/villages/khortytsia.layout.ts';
import { sheetReducer, tabOfBuilding, type SheetAction, type SheetHeights, type SheetState } from '../sheet.ts';
import type { ZoneId } from '../../content/villages/khortytsia.layout.ts';
import { BUY_MODES } from '../../content/economy.ts';
import { LANGS, type GameState } from '../../core/state.ts';
import type { BuyMode } from '../../core/economy.ts';
import { villageOf } from '../../core/modifiers.ts';
import { cultureClaimable } from '../../core/culture-selectors.ts';
import { raidClaimable } from '../../core/raid-selectors.ts';
import { farmRowView, questClaimable, questTarget, visibleSichIds, type QuestTarget } from '../../core/selectors.ts';
import type { QuestKind } from '../../core/systems/quests.ts';
import { useAct, useGame, useGameReader } from '../hooks/useGame.ts';
import { useText, type Text } from '../hooks/useText.ts';
import { lessMotion } from '../motion.ts';
import { QuestList, QuestStrip } from './QuestStrip.tsx';
import { RaidsBlock } from './Raids.tsx';
import { Treasury } from './Treasury.tsx';
import { FarmRow, HireRow, SichRow } from './Rows.tsx';

import type { CultureTabProps } from './Culture.tsx';
import { LazySlot, retryable } from './LazySlot.tsx';

// The «Культура» tab is its own chunk (M4-13): the start scripts stay under `check:dist`'s budget (startup.spec), and
// the tab is never the first thing on screen. Its red dot (`cultureClaimable`) stays here, in the start chunk.
const CULTURE_TAB = retryable<CultureTabProps>(() => import('./Culture.tsx').then((m) => ({ default: m.CultureTab })));
import styles from './Panel.module.css';

const TABS = ['farm', 'sich', 'culture', 'more'] as const;
type Tab = (typeof TABS)[number];
/** The world zone a tab shows (`culture` and `more` have none). */
export type TabZone = Exclude<Tab, 'culture' | 'more'>;
/** A tab of no zone: the camera neither follows it nor takes the sheet off it. */
const zoneOf = (tab: Tab): TabZone | null => (tab === 'farm' || tab === 'sich' ? tab : null);
/** The tab of a world zone: the suburb's buildings are in the farm list. */
const TAB_OF_ZONE: Record<ZoneId, TabZone> = { farm: 'farm', suburb: 'farm', sich: 'sich' };

export interface PanelProps {
  /** A tab was chosen: take the camera to its zone. */
  readonly onZone?: (zone: TabZone) => void;
  /** Subscribes to the zone the camera settles in (called with the current one at once); returns the unsubscribe. */
  readonly zoneSource?: ((listener: (zone: ZoneId) => void) => () => void) | undefined;
  /** A building tapped in the world (a new object per tap): open at least half on its row. */
  readonly reveal?: Reveal | null;
  /**
   * The sheet opened on `building`'s row with its top edge at client y `sheetTop` (the camera may clear it); `centre`
   * for a quest's target (M3-15: the building may be off screen — the camera goes to it).
   */
  readonly onReveal?: ((building: PlotBuilding, sheetTop: number, centre: boolean) => void) | undefined;
  /**
   * The selected building changed (M2-29): the tapped building while its row is the current one and the sheet is open,
   * else `null` — the world outlines it.
   */
  readonly onSelect?: ((building: PlotBuilding | null) => void) | undefined;
  /** The state to start in (half by default). */
  readonly initial?: SheetState;
  /** «Обрати похід» on an idle slot: open the raid map for it (GameUi, M3-11; absent: the idle cards have no button). */
  readonly onChooseRaid?: ((slot: number) => void) | undefined;
}

export interface Reveal {
  readonly building: PlotBuilding;
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

/** What a reveal lights in a list (`data-target`): a building's row, the hire row, a raid slot's card. */
type RowKey = PlotBuilding | 'hire' | `raid.${string}`;

/** A row to open on: its tab, its key, the building the camera clears (none: the Sich zone), the sheet height. */
interface Aim {
  readonly tab: TabZone;
  readonly key: RowKey;
  readonly building: PlotBuilding | null;
  /** A quest tap (M3-15): exactly half, the camera centred on the building, and a read-out; a world tap only opens. */
  readonly half: boolean;
  /** A quest's Sich building that cannot be bought yet: its unlock (said instead of «lit»). */
  readonly locked: SichUnlock | null;
}

/** A quest target as a row to open on; null for a counter with no row (a hint instead). */
function aimOf(target: QuestTarget): Aim | null {
  switch (target.kind) {
    case 'farm':
      return { tab: 'farm', key: target.id, building: target.id, half: true, locked: null };
    case 'sich':
      return { tab: 'sich', key: target.id, building: target.id, half: true, locked: target.locked };
    case 'hire':
      return { tab: 'sich', key: 'hire', building: null, half: true, locked: null };
    case 'raid':
      return { tab: 'sich', key: `raid.${String(target.slot)}`, building: null, half: true, locked: null };
    // The «Культура» tab comes with M4-12; culture/hero taps lead to the node/card with M4-16 (a plain hint until then).
    case 'culture':
    case 'hero':
    case 'tap':
    case 'none':
      return null;
  }
}

const RAID_KEY = 'raid.';
const isRaidKey = (key: RowKey): key is `raid.${string}` => key.startsWith(RAID_KEY);
/** The raid slot a key lights, or null. */
const raidSlotOf = (key: RowKey | null): number | null =>
  key !== null && isRaidKey(key) ? Number(key.slice(RAID_KEY.length)) : null;
/** The building a key is the row of (the world outlines it), or null. */
const buildingOf = (key: RowKey | null): PlotBuilding | null =>
  key === null || key === 'hire' || isRaidKey(key) ? null : key;

/** Why a locked Sich building cannot be bought yet (the row's own note says the same). */
function unlockReason(t: Text['t'], u: SichUnlock): string {
  switch (u.kind) {
    case 'start':
      return '';
    case 'farmAll':
      return t('ui.unlock.farmAll', { level: u.level });
    case 'land':
      return t('ui.unlock.land', { land: u.land });
  }
}

/** Scrolls `scroll` (only it, never the page) the least that shows `row` whole — `block: 'nearest'`. */
function scrollNearest(scroll: HTMLElement, row: HTMLElement): void {
  const s = scroll.getBoundingClientRect();
  const r = row.getBoundingClientRect();
  if (r.top < s.top) scroll.scrollTop -= s.top - r.top;
  else if (r.bottom > s.bottom) scroll.scrollTop += Math.min(r.bottom - s.bottom, r.top - s.top);
}

/** A quest tap's read-out; `hint` = also on screen (a counter, a locked or missing row). */
interface News {
  readonly id: number;
  readonly text: string;
  readonly hint: boolean;
}

/** A tapped row's marks: `lit` = the gold rim (fades), `current` = aria-current (until the next action). */
interface Marks {
  readonly lit: RowKey | null;
  readonly current: RowKey | null;
}

function FarmList({ mode, marks }: { mode: BuyMode; marks: Marks }) {
  const ids = useGame((s) => villageOf(s).buildings.map((b) => b.id), sameIds);
  // The nearest goal (M4-16a): the first row, in display order, the ducats do not reach — the core's own row views say
  // which; only its «Бракує дукатів» is shown, the others are read out with their buttons.
  const nearest = useGame((s) => ids.find((id) => farmRowView(s, id, mode).blocked === 'ducats') ?? null);
  return (
    <ul className={styles.list}>
      {ids.map((id) => (
        <FarmRow
          key={id}
          id={id}
          mode={mode}
          nearest={id === nearest}
          highlighted={id === marks.lit}
          current={id === marks.current}
        />
      ))}
    </ul>
  );
}

function SichList({ mode, marks }: { mode: BuyMode; marks: Marks }) {
  const ids = useGame(visibleSichIds, sameIds);
  return (
    <ul className={styles.list}>
      <HireRow mode={mode} highlighted={marks.lit === 'hire'} current={marks.current === 'hire'} />
      {ids.map((id) => (
        <SichRow key={id} id={id} mode={mode} highlighted={id === marks.lit} current={id === marks.current} />
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

/** Layout numbers the sheet needs (css px): the box it lives in, its bar (tabs + border + safe area), the HUD. */
interface Box {
  readonly h: number;
  readonly bottom: number;
  readonly bar: number;
  readonly hud: number;
}

/** The three heights — the one source for the sheet's style, its drag and the camera reveal. */
function heightsOf(box: Box): SheetHeights {
  const full = Math.max(box.bar, box.h - box.hud);
  const half = Math.min(full, Math.max(Math.round(box.h * SHEET.halfRatio), box.bar + SHEET.minHalfBodyPx));
  return { collapsed: box.bar, half, full };
}

/** The HUD's height (`--hud-h`, measured by the HUD itself). */
function hudHeight(el: HTMLElement): number {
  const v = Number.parseFloat(getComputedStyle(el).getPropertyValue('--hud-h'));
  return Number.isFinite(v) ? v : 0;
}

/** A press on the bar: where it started, whether it became a drag, the last samples for the release velocity. */
interface Drag {
  readonly id: number;
  readonly y0: number;
  readonly h0: number;
  /** The heights at the press (one measure per gesture). */
  readonly heights: SheetHeights;
  dragging: boolean;
  samples: { y: number; t: number }[];
}

/** Drag samples within the velocity window before `t`. */
function recentSamples(samples: readonly { y: number; t: number }[], t: number): { y: number; t: number }[] {
  return samples.filter((s) => t - s.t <= SHEET.velocityWindowMs);
}

const reduceSheet = (s: SheetState, a: SheetAction): SheetState => sheetReducer(s, a);

const selectRaidClaimable = (s: GameState): boolean => raidClaimable(s, s.time.lastSeen);

export function Panel({
  onZone,
  zoneSource,
  reveal = null,
  onReveal,
  onSelect,
  initial = 'half',
  onChooseRaid,
}: PanelProps) {
  const [tab, setTab] = useState<Tab>('farm');
  // Roving tabindex (manual activation): arrows move focus between the tabs; Enter/Space/click choose one.
  const [focusTab, setFocusTab] = useState<Tab>('farm');
  const [sheet, dispatch] = useReducer(reduceSheet, initial);
  useEffect(
    () =>
      zoneSource?.((zone) => {
        setTab((current) => (zoneOf(current) === null ? current : TAB_OF_ZONE[zone]));
      }),
    [zoneSource],
  );
  const [mode, setMode] = useState<BuyMode>(1);
  const { t } = useText();
  const base = useId();
  const sectionRef = useRef<HTMLElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // A building tapped in the world (or a quest's target): its row is the current one (aria-current) until the player
  // does something else in the sheet; the gold rim fades after SHEET.highlightMs.
  const [current, setCurrent] = useState<RowKey | null>(null);
  const [lit, setLit] = useState<RowKey | null>(null);

  const select = (next: Tab): void => {
    setTab(next);
    setFocusTab(next);
    setCurrent(null);
    dispatch({ type: 'open' });
    const zone = zoneOf(next);
    if (zone !== null) onZone?.(zone);
  };

  // The box, the bar and the HUD, kept in step with the screen (rotation, safe areas, larger text).
  const [box, setBox] = useState<Box | null>(null);
  useLayoutEffect(() => {
    const section = sectionRef.current;
    const bar = barRef.current;
    const parent = section?.parentElement;
    if (!section || !bar || !parent) return undefined;
    const measure = (): void => {
      const pad = Number.parseFloat(getComputedStyle(section).paddingBottom);
      const top = parent.getBoundingClientRect().top;
      setBox({
        h: parent.clientHeight,
        bottom: top + parent.clientHeight,
        bar: bar.offsetHeight + section.clientTop + (Number.isFinite(pad) ? pad : 0),
        hud: hudHeight(section),
      });
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(parent);
    observer.observe(bar);
    const hud = document.querySelector('header');
    if (hud) observer.observe(hud);
    return () => {
      observer.disconnect();
    };
  }, []);
  const heights = box ? heightsOf(box) : null;

  // A drag on the bar (tabs + button): past the slop the sheet follows the finger; the release snaps (ui/sheet.ts).
  // The press's moves and release are followed on the window: the finger leaves the 44-px bar at once, and capturing
  // the pointer on the bar would retarget the click of a plain tab press away from its tab.
  const [dragH, setDragH] = useState<number | null>(null);
  const swallowClick = useRef(false);
  const stopDrag = useRef<(() => void) | null>(null);
  useEffect(
    () => () => {
      stopDrag.current?.();
    },
    [],
  );
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>): void => {
    const section = sectionRef.current;
    if (e.button !== 0 || !section || !heights || stopDrag.current) return;
    swallowClick.current = false;
    const d: Drag = {
      id: e.pointerId,
      y0: e.clientY,
      h0: section.getBoundingClientRect().height,
      heights,
      dragging: false,
      samples: [{ y: e.clientY, t: performance.now() }],
    };
    const within = (h: number): number => Math.min(d.heights.full, Math.max(d.heights.collapsed, h));
    const onMove = (ev: PointerEvent): void => {
      if (ev.pointerId !== d.id) return;
      const dy = ev.clientY - d.y0;
      if (!d.dragging && Math.abs(dy) < SHEET.dragSlopPx) return;
      d.dragging = true;
      const now = performance.now();
      d.samples = [...recentSamples(d.samples, now), { y: ev.clientY, t: now }];
      setDragH(within(d.h0 - dy));
    };
    const stop = (): void => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      stopDrag.current = null;
    };
    function end(ev: PointerEvent): void {
      if (ev.pointerId !== d.id) return;
      stop();
      if (!d.dragging) return;
      const cancelled = ev.type === 'pointercancel';
      // The click that ends a drag is not a tab choice.
      swallowClick.current = !cancelled;
      setDragH(null);
      if (cancelled) return;
      const now = performance.now();
      const first = recentSamples(d.samples, now)[0];
      const dt = first ? now - first.t : 0;
      const velocity = first && dt > 0 ? (ev.clientY - first.y) / dt : 0;
      dispatch({ type: 'release', height: within(d.h0 - (ev.clientY - d.y0)), velocity, heights: d.heights });
    }
    stopDrag.current = stop;
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  };

  // Collapsing hides the list: focus that was inside it moves to the bar's button.
  const before = useRef(sheet);
  useEffect(() => {
    if (before.current !== sheet && sheet === 'collapsed') {
      const body = document.getElementById(`${base}-panel`);
      if (body?.contains(document.activeElement)) toggleRef.current?.focus();
    }
    before.current = sheet;
  }, [sheet, base]);

  // Esc collapses the open sheet wherever the focus is — unless the sheet is inert (a window is open over it) or the
  // key was already handled.
  useEffect(() => {
    if (sheet === 'collapsed') return undefined;
    const onKey = (e: globalThis.KeyboardEvent): void => {
      if (e.key !== 'Escape' || e.defaultPrevented || sectionRef.current?.closest('[inert]')) return;
      e.preventDefault();
      dispatch({ type: 'escape' });
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [sheet]);

  // The world outlines the current row's building while the sheet shows it (M2-29).
  const selected = sheet === 'collapsed' ? null : buildingOf(current);
  const notifySelect = useRef(onSelect);
  useLayoutEffect(() => {
    notifySelect.current = onSelect;
  });
  useEffect(() => {
    notifySelect.current?.(selected);
  }, [selected]);

  // A building tapped in the world, or a quest's target (a new object per tap).
  const [aim, setAim] = useState<Aim | null>(null);
  useEffect(() => {
    if (reveal)
      setAim({
        tab: tabOfBuilding(reveal.building),
        key: reveal.building,
        building: reveal.building,
        half: false,
        locked: null,
      });
  }, [reveal]);
  // What a quest tap says (role=status): where its target is, or a hint — a counter's, or why its row is not there —
  // also shown over the world just above the sheet (no layout shift); any press or key in the sheet dismisses it.
  const [news, setNews] = useState<News | null>(null);
  const say = useCallback((text: string, hint: boolean): void => {
    setNews((p) => ({ id: (p?.id ?? 0) + 1, text, hint }));
  }, []);
  const readGame = useGameReader();
  const onGo = (kind: QuestKind): void => {
    const target = questTarget(readGame(), kind);
    const next = aimOf(target);
    if (next) {
      setAim(next);
      // No building to clear: the camera goes to the Sich (the hire row, the raid cards).
      if (next.building === null) onZone?.(next.tab);
      return;
    }
    if (target.kind === 'tap') {
      // Taps go on the farm's ground: the camera there, the sheet down so the ground is free to tap.
      onZone?.('farm');
      dispatch({ type: 'escape' });
    }
    say(t(target.kind === 'tap' ? 'ui.quest.hint.tap' : 'ui.quest.hint.none'), true);
  };
  // A hint stays a few seconds; the read-out of a shown target is never on screen (the lit row says it).
  useEffect(() => {
    if (!news?.hint) return undefined;
    const timer = setTimeout(() => {
      setNews((p) => (p === news ? null : p));
    }, SHEET.hintMs);
    return () => {
      clearTimeout(timer);
    };
  }, [news]);
  // The reveal once its list is rendered (the effect below needs the row in the DOM).
  const [shown, setShown] = useState<Aim | null>(null);
  useEffect(() => {
    if (!aim) return undefined;
    setTab(aim.tab);
    setFocusTab(aim.tab);
    dispatch({ type: aim.half ? 'half' : 'open' });
    setCurrent(aim.key);
    setLit(aim.key);
    setShown(aim);
    const timer = setTimeout(() => {
      setLit(null);
    }, SHEET.highlightMs);
    return () => {
      clearTimeout(timer);
    };
  }, [aim]);
  // Once the list shows the row: say what was found, let the camera clear the building, and scroll the row into view
  // (inside the list only) once the sheet stands at its height. Only a new reveal does this — later sheet moves and
  // resizes are the player's — so the rest is read from a ref.
  const latest = useRef({ onReveal, sheet, heights, box, t });
  useLayoutEffect(() => {
    latest.current = { onReveal, sheet, heights, box, t };
  });
  useEffect(() => {
    if (!shown) return undefined;
    const scroll = scrollRef.current;
    const section = sectionRef.current;
    const row = scroll?.querySelector<HTMLElement>(`[data-target="${shown.key}"]`) ?? null;
    const { onReveal: notify, sheet: now, heights: hs, box: b, t: tr } = latest.current;
    if (shown.half) {
      const tab = tr(`ui.tab.${shown.tab}`);
      // A locked building, or no row at all (one this land does not show): the reason, never «lit».
      if (shown.locked) say(tr('ui.quest.locked', { reason: unlockReason(tr, shown.locked) }), true);
      else if (!row) say(tr('ui.quest.missing'), true);
      else say(tr('ui.quest.shown', { tab }), false);
    }
    if (hs && b && now !== 'full' && shown.building !== null) notify?.(shown.building, b.bottom - hs[now], shown.half);
    if (!scroll || !row || !section) return undefined;
    // The list's height changes while the sheet snaps: measure once its height transition has ended (at once under
    // «менше руху», or when it already stands there). A slow frame can stretch the snap past its nominal time, so the
    // fallback checks every `snapMs` whether the sheet stands at its height (a transition that never reports).
    const target = hs && now !== 'full' ? hs[now] : null;
    const standing = (): boolean => target === null || Math.abs(section.getBoundingClientRect().height - target) < 1;
    if (lessMotion() || standing()) {
      scrollNearest(scroll, row);
      return undefined;
    }
    let checks = 0;
    const onEnd = (e: TransitionEvent): void => {
      if (e.target === section && e.propertyName === 'height' && standing()) finish();
    };
    const stop = (): void => {
      section.removeEventListener('transitionend', onEnd);
      clearInterval(timer);
    };
    const finish = (): void => {
      stop();
      scrollNearest(scroll, row);
    };
    section.addEventListener('transitionend', onEnd);
    const timer = setInterval(() => {
      checks += 1;
      if (standing() || checks >= SHEET.revealChecks) finish();
    }, SHEET.snapMs);
    return stop;
  }, [shown, say]);

  // WAI-ARIA tabs, manual activation: arrows and Home/End move the focus; Enter/Space (a click) choose — so a
  // collapsed sheet never opens and the camera never moves while the player only looks along the tabs.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    const i = TABS.indexOf(focusTab);
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
    const next = TABS[index] ?? focusTab;
    setFocusTab(next);
    document.getElementById(`${base}-tab-${next}`)?.focus();
  };

  // Heights in px for collapsed/half (measured); full is CSS (up to the HUD); a drag sets its own.
  const height = dragH ?? (heights && sheet !== 'full' ? heights[sheet] : null);
  const style = {
    '--sheet-ms': `${String(SHEET.snapMs)}ms`,
    ...(height !== null && { height: `${String(height)}px` }),
  } as CSSProperties;
  const collapsed = sheet === 'collapsed';
  const marks = { lit, current };
  // Red dots (SPEC §6.7) while the sheet is down: on «Ще» — where the tasks live (§10.3) — when a quest waits to be
  // claimed, on «Січ» when a raid is back (an idle slot never: §0.1 П1). Not by colour alone: the tab's description
  // says it.
  const questDot = useGame(questClaimable);
  const raidDot = useGame(selectRaidClaimable);
  // «Культура» (Q13): a node never learned that can be learned now, or a hero just come whose first level is affordable.
  const cultureDot = useGame(cultureClaimable);
  const dots: Readonly<Record<Tab, string | null>> = {
    farm: null,
    sich: collapsed && raidDot ? 'ui.raids.claimable' : null,
    culture: collapsed && cultureDot ? 'ui.culture.claimable' : null,
    more: collapsed && questDot ? 'ui.quest.claimable' : null,
  };
  return (
    <section
      ref={sectionRef}
      className={styles.panel}
      data-state={sheet}
      data-dragging={dragH !== null ? '' : undefined}
      style={style}
      // Anything the player does in the sheet ends the tapped row's «current» mark and a quest hint.
      onPointerDownCapture={() => {
        setCurrent(null);
        setNews(null);
      }}
      onKeyDownCapture={() => {
        setCurrent(null);
        setNews(null);
      }}
    >
      {/* One read-out for every quest tap; a hint also stands over the world just above the sheet (no list moves). */}
      <p className={styles.said} role="status">
        {news && <span key={news.id}>{news.text}</span>}
      </p>
      {news?.hint && (
        <p key={news.id} className={styles.hint} aria-hidden="true" data-hint="">
          {news.text}
        </p>
      )}
      <div
        ref={barRef}
        className={styles.bar}
        onPointerDown={onPointerDown}
        onClickCapture={(e) => {
          if (!swallowClick.current) return;
          swallowClick.current = false;
          e.preventDefault();
          e.stopPropagation();
        }}
      >
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
              aria-describedby={dots[id] !== null ? `${base}-dot-${id}` : undefined}
              tabIndex={id === focusTab ? 0 : -1}
              onClick={() => {
                select(id);
              }}
            >
              {t(`ui.tab.${id}`)}
              {dots[id] !== null && <span className={styles.dot} aria-hidden="true" data-dot="" />}
            </button>
          ))}
        </div>
        {TABS.map((id) => {
          const key = dots[id];
          return key === null ? null : (
            <span key={id} id={`${base}-dot-${id}`} hidden>
              {t(key)}
            </span>
          );
        })}
        <button
          ref={toggleRef}
          type="button"
          className={styles.toggle}
          aria-expanded={!collapsed}
          aria-controls={`${base}-panel`}
          aria-label={t(`ui.sheet.${sheet}`)}
          onClick={() => {
            dispatch({ type: 'toggle' });
          }}
        />
      </div>
      <div
        id={`${base}-panel`}
        role="tabpanel"
        aria-labelledby={`${base}-tab-${tab}`}
        tabIndex={0}
        hidden={collapsed}
        className={styles.body}
      >
        {tab !== 'more' && <QuestStrip onGo={onGo} />}
        {/* On «Культура» the picker drives only the heroes: it stands in their block (M4-13 review). */}
        {tab !== 'more' && tab !== 'culture' && <ModePicker mode={mode} onChange={setMode} />}
        <div ref={scrollRef} className={styles.scroll}>
          {tab === 'farm' && <FarmList mode={mode} marks={marks} />}
          {tab === 'sich' && (
            <>
              <RaidsBlock onChoose={onChooseRaid} lit={raidSlotOf(lit)} current={raidSlotOf(current)} />
              <SichList mode={mode} marks={marks} />
            </>
          )}
          {tab === 'culture' && (
            <LazySlot of={CULTURE_TAB} props={{ mode, picker: <ModePicker mode={mode} onChange={setMode} /> }} />
          )}
          {tab === 'more' && (
            <>
              <QuestList onGo={onGo} />
              <Treasury />
              <Settings />
            </>
          )}
        </div>
      </div>
    </section>
  );
}
