// @vitest-environment jsdom
// The raid map (plan M3-11 + review, §0.1 П1–П3/П5/П9, SPEC §2.6/§10): «Обрати похід» opens a full-screen window over
// the game with today's board as five buttons (the atlas fetch fails here, so they are the visible list the map falls
// back to — the same group, names and behaviour as the flags); it opens on the suggested offer's card
// (`raidSuggested`) with exactly the numbers of `raidBoardView` (shown = granted); «Вирушити» starts that tier from the
// chosen squad (or the board's free one) and closes the map; off with its reason when no squad is free or the army is
// too weak (then the card says how much power is missing instead of the floor chance); a refused start keeps the map
// open and says why; a choice is read out; the first-raid step lights the 5-minute flag; arrows move between the
// flags, Esc closes, the focus comes back.
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SHEET } from '../../../src/content/juice.ts';
import { QUEST_CHAIN } from '../../../src/content/quests.ts';
import { BOARD, RAID_TIER_IDS, RAIDS, REGIONS, type RaidTierId } from '../../../src/content/raids.ts';
import { pityThreshold } from '../../../src/content/relics.ts';
import type { Action } from '../../../src/core/actions.ts';
import { Big } from '../../../src/core/big.ts';
import type { GameEvent } from '../../../src/core/events.ts';
import { wholePercent } from '../../../src/core/percent.ts';
import { raidBoardView, raidSuggested, type RaidOfferView } from '../../../src/core/raid-selectors.ts';
import { createInitialState, type GameState, type Lang } from '../../../src/core/state.ts';
import { createStore, type GameStore } from '../../../src/core/store.ts';
import { raidTier, type RaidSlot } from '../../../src/core/systems/raids.ts';
import { formatBig, formatDuration, formatReturnAt, t } from '../../../src/i18n/index.ts';
import { GameUi } from '../../../src/ui/App.tsx';
import { GameProvider } from '../../../src/ui/hooks/useGame.ts';

const T0 = 1_763_400_000_000;
const IDLE: RaidSlot = { kind: 'idle' };
const NBSP = String.fromCharCode(0xa0);

vi.stubGlobal('fetch', () => Promise.reject(new Error('offline')));
vi.spyOn(console, 'warn').mockImplementation(() => undefined);

/** A played land with an army of `infantry` (the welcome beat seen, so no story window opens). */
function game(o: { infantry?: number; lang?: Lang; slots?: readonly RaidSlot[]; pity?: number } = {}): GameState {
  const s = createInitialState({ seed: 5, now: T0 });
  return {
    ...s,
    currencies: { ...s.currencies, ducats: Big.from(1e6) },
    village: { ...s.village, levels: { ...s.village.levels, field: 30, garden: 12, windmill: 8 } },
    army: { infantry: o.infantry ?? 120 },
    raids: { ...s.raids, slots: o.slots ?? [IDLE, IDLE, IDLE], pity: o.pity ?? 0 },
    settings: { ...s.settings, lang: o.lang ?? 'uk' },
    story: { seen: ['khortytsia.shore'] },
  };
}

/** The chain on its first-raid step (`raid1`, Q7). */
function onRaid1(s: GameState): GameState {
  const index = QUEST_CHAIN.findIndex((q) => q.id === 'khortytsia.raid1');
  return { ...s, quests: { ...s.quests, chain: { kind: 'listed', index, base: s.stats.raidsSent } } };
}

/** `refuse`: the store answers every startRaid with this rejection and leaves the state as it is. */
function mount(state: GameState, refuse?: GameEvent) {
  const store = createStore(state);
  const sent: Action[] = [];
  const recording: GameStore = {
    ...store,
    dispatch: (action, now) => {
      sent.push(action);
      if (refuse && action.type === 'startRaid') return [refuse];
      return store.dispatch(action, now);
    },
  };
  render(
    <GameProvider store={recording} now={() => store.getState().time.lastSeen}>
      <GameUi world={null} notice="none" />
    </GameProvider>,
  );
  fireEvent.click(screen.getByRole('tab', { name: /^(Січ|Sich)/ }));
  return { store, sent };
}

/** «Обрати похід» of squad `n` (1-based) → the map window. */
function openMap(n: number, lang: Lang = 'uk'): HTMLElement {
  const label = lang === 'uk' ? `Загін ${String(n)}: обрати похід` : `Squad ${String(n)}: choose a raid`;
  const button = screen.getByRole('button', { name: label });
  button.focus();
  fireEvent.click(button);
  return screen.getByRole('dialog', { name: lang === 'uk' ? /^Мапа походів/ : /^Raid map/ });
}

const pct = (lang: Lang, whole: number): string =>
  t(lang, 'ui.percent', { value: formatBig(Big.from(whole), lang, 'words') });
const regionName = (lang: Lang, o: RaidOfferView): string =>
  t(lang, REGIONS.khortytsia.find((r) => r.id === o.region)?.nameKey ?? '');
const loot = (lang: Lang, l: RaidOfferView['success']): string =>
  `${t(lang, 'granted.ducats', { value: formatBig(l.ducats, lang, 'words') })}, ${t(lang, 'granted.glory', { value: formatBig(l.glory, lang, 'words') })}`;
const group = (map: HTMLElement): HTMLElement => within(map).getByRole('group', { name: /^(Походи дня|Today)/ });
const flag = (map: HTMLElement, o: RaidOfferView, lang: Lang = 'uk'): HTMLElement =>
  within(group(map)).getByRole('button', { name: new RegExp(`— ${regionName(lang, o)},`) });
const card = (map: HTMLElement, o: RaidOfferView, lang: Lang = 'uk'): HTMLElement =>
  within(map).getByRole('region', { name: `${t(lang, raidTier(o.tier).nameKey)} — ${regionName(lang, o)}` });
const fact = (c: HTMLElement, term: string): string =>
  within(c).getByText(term, { selector: 'dt' }).nextElementSibling?.textContent ?? '';
const description = (el: HTMLElement): string =>
  (el.getAttribute('aria-describedby') ?? '')
    .split(' ')
    .filter(Boolean)
    .map((id) => document.getElementById(id)?.textContent ?? '')
    .join(' ');
const offerOf = (s: GameState, tier: RaidTierId): RaidOfferView => {
  const o = raidBoardView(s).offers.find((x) => x.tier === tier);
  if (!o) throw new Error(tier);
  return o;
};

/** The name a flag carries: tier, duration (+ «на ніч»), region, then its chance or the power missing to set off. */
function flagName(o: RaidOfferView): string {
  const base = `${t('uk', raidTier(o.tier).nameKey)}, ${formatDuration('uk', o.durationSec)}`;
  const night = o.tier === 'h8' ? ', на ніч' : '';
  const state = o.blocked === 'power' ? `ще ${String(o.powerToStart)} сили` : `шанс ${pct('uk', o.chancePct)}`;
  const name = `${base}${night} — ${regionName('uk', o)}, ${state}`;
  const rumor = BOARD.rumors.find((r) => r.id === o.rumor);
  return rumor ? `${name}; чутка: ${t('uk', rumor.nameKey)}` : name;
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('the map window: the day board as flag buttons (M3-11)', () => {
  it('opens over an inert game: one button per offer named by tier, duration, region and chance or need', async () => {
    const { store } = mount(game({ infantry: 120 }));
    const map = openMap(2);
    expect(document.querySelector('[inert]')).not.toBeNull();
    const flags = within(group(map)).getAllByRole('button');
    const board = raidBoardView(store.getState());
    expect(flags).toHaveLength(RAID_TIER_IDS.length);
    board.offers.forEach((o, i) => {
      expect(flags[i]?.getAttribute('aria-label')).toBe(flagName(o));
    });
    // No art: the list shows each offer's short tier, region and chance or need — «на ніч» on the 8-hour one (П1).
    const h8 = offerOf(store.getState(), 'h8');
    expect(flags[4]?.textContent).toBe(`на ніч · ${regionName('uk', h8)} · ще ${String(h8.powerToStart)} сили`);
    const m5 = offerOf(store.getState(), 'm5');
    expect(flags[0]?.textContent).toBe(`5 хв · ${regionName('uk', m5)} · шанс ${pct('uk', m5.chancePct)}`);
    // No countdown to a new board (П2).
    expect(within(map).getByText('Завтра — нові чутки')).toBeTruthy();
    expect(within(map).getByText('Мапа розгортається…')).toBeTruthy();
    // The art never comes: the note says so, and it is true — the list is there to choose from.
    expect(await within(map).findByText('Мапу не вдалося завантажити — походи можна обрати й так')).toBeTruthy();
    expect(within(group(map)).getAllByRole('button')).toHaveLength(RAID_TIER_IDS.length);
  });

  it('opens on the suggested offer (raidSuggested) with its card, the window focused — no flag focused', () => {
    const s = game({ infantry: 2000 });
    mount(s);
    const map = openMap(1);
    const tier = raidSuggested(s);
    expect(tier).not.toBeNull();
    const o = offerOf(s, tier ?? 'm5');
    expect(o.rumor).not.toBeNull();
    expect(flag(map, o).getAttribute('aria-pressed')).toBe('true');
    expect(card(map, o)).toBeTruthy();
    expect(document.activeElement).toBe(map);
    expect(map.querySelector('[data-lit]')).toBeNull();
  });

  it('a flag opens its card with exactly the numbers of raidBoardView (shown = granted, §0.1 П3), and says so', () => {
    const { store } = mount(game({ infantry: 300 }));
    const map = openMap(1);
    for (const tier of RAID_TIER_IDS) {
      const o = offerOf(store.getState(), tier);
      fireEvent.click(flag(map, o));
      expect(flag(map, o).getAttribute('aria-pressed')).toBe('true');
      // The choice is read out (the card under the map changed).
      expect(within(map).getByText(`Обрано: ${flagName(o)}`, { normalizer: (x) => x })).toBeTruthy();
      const c = card(map, o);
      expect(o.success.ducats.gt(0) && o.failure.ducats.gt(0) && o.failure.glory.gt(0), tier).toBe(true);
      expect(fact(c, 'Успіх'), tier).toBe(loot('uk', o.success));
      expect(fact(c, 'Невдача'), tier).toBe(loot('uk', o.failure));
      if (o.blocked === 'power') {
        // Out of reach: the chance (only its floor now) gives way to the power still missing to set off.
        expect(within(c).queryByText('Шанс успіху'), tier).toBeNull();
        expect(within(c).getByText(`Потрібно ще ${String(o.powerToStart)} сили, щоб вирушити`)).toBeTruthy();
      } else {
        expect(fact(c, 'Шанс успіху'), tier).toBe(pct('uk', o.chancePct));
        expect(within(c).queryByText(/^Потрібно ще/)).toBeNull();
      }
      if (o.relicPct > 0) expect(fact(c, 'Реліквія')).toBe(`${pct('uk', o.relicPct)} при успіху`);
      else expect(within(c).queryByText('Реліквія')).toBeNull();
      if (o.pysankyPct > 0)
        expect(fact(c, 'Писанки')).toBe(
          `${pct('uk', o.pysankyPct)} при успіху: ${String(RAIDS.pysanky.min)}–${String(RAIDS.pysanky.max)} писанки`,
        );
      else expect(within(c).queryByText('Писанки')).toBeNull();
      const toFull = within(c).queryByText(/сили — і 100/);
      if (o.powerToFull > 0 && o.blocked !== 'power')
        expect(toFull?.textContent).toBe(`Ще ${String(o.powerToFull)} сили — і 100${NBSP}%`);
      else expect(toFull).toBeNull();
      const { lastSeen } = store.getState().time;
      const tz = store.getState().settings.tzOffsetMin;
      expect(c.textContent).toContain(formatDuration('uk', o.durationSec));
      expect(c.textContent).toContain(formatReturnAt('uk', lastSeen + o.durationSec * 1000, lastSeen, tz));
      const rumor = BOARD.rumors.find((r) => r.id === o.rumor);
      for (const r of BOARD.rumors) {
        const kind = r.effect.kind === 'loot' ? 'здобичі' : 'до шансу реліквії';
        const line = within(c).queryByText(
          `${t('uk', r.nameKey)}: +${pct('uk', wholePercent(r.effect.share))} ${kind}`,
          { normalizer: (x) => x },
        );
        expect(line !== null, `${tier} ${r.id}`).toBe(r === rumor);
      }
    }
    // The day has one rumour offer (Q3), some tier out of reach and some below 100 % at this power.
    const offers = raidBoardView(store.getState()).offers;
    expect(offers.some((o) => o.rumor !== null)).toBe(true);
    expect(offers.some((o) => o.blocked === 'power')).toBe(true);
    expect(offers.some((o) => o.blocked === null && o.powerToFull > 0)).toBe(true);
  });

  it('«реліквія близько» only when the offer says a success is sure to bring a relic (§0.1 П5)', () => {
    const s = game({ infantry: 900, pity: pityThreshold(0) - 1 });
    mount(s);
    const map = openMap(1);
    for (const tier of RAID_TIER_IDS) {
      const o = offerOf(s, tier);
      fireEvent.click(flag(map, o));
      const sure = within(card(map, o)).queryByText('Старі козаки кажуть: реліквія близько');
      expect(sure !== null, tier).toBe(o.relicSure);
    }
    expect(RAID_TIER_IDS.some((tier) => offerOf(s, tier).relicSure)).toBe(true);
  });

  it('en: plural pysanky and the English names', () => {
    const s = game({ infantry: 900, lang: 'en' });
    mount(s);
    const map = openMap(1, 'en');
    const o = offerOf(s, 'h8');
    fireEvent.click(flag(map, o, 'en'));
    const c = card(map, o, 'en');
    expect(fact(c, 'Pysanky')).toBe(`${pct('en', o.pysankyPct)} on success: 1–2 pysanky`);
    expect(flag(map, o, 'en').getAttribute('aria-label')).toMatch(/^Long campaign, 8 hours, overnight — /);
    expect(flag(map, o, 'en').textContent).toMatch(/^night · /);
  });
});

describe('«Вирушити» (M3-11)', () => {
  it('starts the tier from the squad the map was opened for, closes the map and puts that squad on the road', () => {
    const { store, sent } = mount(game({ infantry: 120 }));
    const map = openMap(2);
    const o = offerOf(store.getState(), 'm30');
    fireEvent.click(flag(map, o));
    fireEvent.click(within(map).getByRole('button', { name: `Вирушити: Дозор — ${regionName('uk', o)}, загін 2` }));
    expect(sent.filter((a) => a.type === 'startRaid')).toEqual([{ type: 'startRaid', slot: 1, tier: 'm30' }]);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(store.getState().raids.slots[1]?.kind).toBe('running');
    expect(document.querySelector('[inert]')).toBeNull();
    // useDialogFocus: «Обрати похід» unmounted with the idle card → the focus falls back to the «Походи» block (the
    // opener's nearest ancestor that takes the focus), not to the page's body.
    expect(document.activeElement).toBe(screen.getByRole('region', { name: 'Походи' }));
    const squad = within(screen.getByRole('region', { name: 'Походи' })).getByRole('listitem', { name: 'Загін 2' });
    expect(within(squad).getByText(`Дозор — ${regionName('uk', o)}`)).toBeTruthy();
  });

  it('the chosen squad taken meanwhile: the board’s free squad goes (the header names it); none free: off', () => {
    const { store, sent } = mount(game({ infantry: 120 }));
    const map = openMap(2);
    expect(within(map).getByRole('heading', { level: 2 }).textContent).toBe('Мапа походівЗагін 2');
    // Squad 2 sets off from elsewhere while the map is open (the store, as «Ще раз» would).
    act(() => {
      store.dispatch({ type: 'startRaid', slot: 1, tier: 'm5' }, store.getState().time.lastSeen);
    });
    expect(within(map).getByRole('heading', { level: 2 }).textContent).toBe('Мапа походівЗагін 1');
    const o = offerOf(store.getState(), 'h1');
    fireEvent.click(flag(map, o));
    expect(within(map).getByText(/^У дорозі: загін 2 — Розвідка — /)).toBeTruthy();
    const go = within(map).getByRole('button', { name: /^Вирушити: .*, загін 1$/ });
    act(() => {
      store.dispatch({ type: 'startRaid', slot: 0, tier: 'm5' }, store.getState().time.lastSeen);
    });
    const off = within(map).getByRole('button', { name: /^Вирушити/ });
    expect((off as HTMLButtonElement).disabled).toBe(true);
    expect(description(off)).toBe('Усі загони в дорозі');
    expect(go).toBe(off);
    sent.length = 0;
    fireEvent.click(off);
    expect(sent).toEqual([]);
  });

  it('too little power for a tier: «Вирушити» off with the reason; the card still shows what it would bring', () => {
    const s = game({ infantry: 30 });
    const o = offerOf(s, 'h8');
    expect(o.blocked).toBe('power');
    const { sent } = mount(s);
    const map = openMap(1);
    fireEvent.click(flag(map, o));
    const go = within(map).getByRole('button', { name: /^Вирушити/ });
    expect((go as HTMLButtonElement).disabled).toBe(true);
    expect(description(go)).toBe('Замало сили для цього походу');
    expect(fact(card(map, o), 'Успіх')).toBe(loot('uk', o.success));
    fireEvent.click(go);
    expect(sent.filter((a) => a.type === 'startRaid')).toEqual([]);
  });

  it('a start the core refuses keeps the map open and says why', () => {
    const refuse: GameEvent = { type: 'ActionRejected', action: 'startRaid', reason: 'slotBusy' };
    const s = game({ infantry: 120 });
    const { sent } = mount(s, refuse);
    const map = openMap(1);
    const o = offerOf(s, 'm5');
    fireEvent.click(flag(map, o));
    const go = within(map).getByRole('button', { name: /^Вирушити/ });
    fireEvent.click(go);
    expect(sent.filter((a) => a.type === 'startRaid')).toEqual([{ type: 'startRaid', slot: 0, tier: 'm5' }]);
    expect(screen.getByRole('dialog')).toBe(map);
    expect(description(go)).toBe('Цей загін уже в дорозі');
    // The reason is the footer's polite status line (the footer is the window's own row, under the card).
    const note = document.getElementById(go.getAttribute('aria-describedby') ?? '');
    expect(note?.getAttribute('role')).toBe('status');
    expect(note?.textContent).toBe('Цей загін уже в дорозі');
  });
});

describe('onboarding, keyboard and closing', () => {
  it('on the first-raid step the map opens on the 5-minute flag, focused, its card open, lit for highlightMs (П9)', () => {
    vi.useFakeTimers();
    const s = onRaid1(game({ infantry: 1 }));
    mount(s);
    const map = openMap(1);
    const m5 = offerOf(s, 'm5');
    const first = flag(map, m5);
    expect(document.activeElement).toBe(first);
    expect(first.getAttribute('aria-pressed')).toBe('true');
    expect(first.hasAttribute('data-lit')).toBe(true);
    expect(fact(card(map, m5), 'Шанс успіху')).toBe(pct('uk', 100));
    act(() => {
      vi.advanceTimersByTime(SHEET.highlightMs);
    });
    expect(first.hasAttribute('data-lit')).toBe(false);
  });

  it('arrows move between the flags in tier order (one Tab stop), Enter opens the card, Esc closes the map', () => {
    const s = game();
    mount(s);
    const opener = screen.getByRole('button', { name: 'Загін 1: обрати похід' });
    const map = openMap(1);
    const flags = within(group(map)).getAllByRole('button');
    expect(flags.filter((f) => f.tabIndex === 0)).toHaveLength(1);
    // The Tab stop is the suggested offer's flag; walk from the first one.
    flags[0]?.focus();
    fireEvent.keyDown(document.activeElement ?? map, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(flags[1]);
    fireEvent.keyDown(document.activeElement ?? map, { key: 'End' });
    expect(document.activeElement).toBe(flags[4]);
    fireEvent.keyDown(document.activeElement ?? map, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(flags[0]);
    expect(flags[0]?.tabIndex).toBe(0);
    // Enter on a button is its click.
    fireEvent.click(document.activeElement ?? map);
    expect(card(map, offerOf(s, 'm5'))).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
    // The sheet stays open: Esc was the map's.
    expect(screen.getByRole('region', { name: 'Походи' })).toBeTruthy();
  });

  it('«Закрити» closes it too', () => {
    mount(game());
    const map = openMap(1);
    fireEvent.click(within(map).getByRole('button', { name: 'Закрити мапу походів' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
