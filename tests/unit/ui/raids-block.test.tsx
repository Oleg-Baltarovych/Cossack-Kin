// @vitest-environment jsdom
// The «Походи» block on «Січ» (plan M3-09, §0.1 П1/П4/П10/П12, SPEC §10): one card per open slot — idle «Обрати
// похід», on the road (tier, region, countdown, «повернуться о…», road bar; no chance, no result), back («Забрати»,
// «Ще раз»; «Забрати все» from two) — the army's power with the found relics, and the red dot on «Січ» for a raid
// that is back (never for an empty slot). Everything comes from the core's selectors; the cards only dispatch.
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// A no-break space keeps «+5 %» on one line (M3-12 review).
import { NBSP } from '../../../src/i18n/index.ts';
import { raidTier } from '../../../src/core/systems/raids.ts';
import type { Action } from '../../../src/core/actions.ts';
import { Big } from '../../../src/core/big.ts';
import { createInitialState, type GameState } from '../../../src/core/state.ts';
import { createStore, type GameStore } from '../../../src/core/store.ts';
import type { RaidRoll, RaidSlot } from '../../../src/core/systems/raids.ts';
import type { RaidTierId } from '../../../src/content/raids.ts';
import { Panel, type PanelProps } from '../../../src/ui/components/Panel.tsx';
import { GameProvider } from '../../../src/ui/hooks/useGame.ts';

const T0 = 1_763_400_000_000;
const SEC = 1000;
const MIN = 60 * SEC;
const IDLE: RaidSlot = { kind: 'idle' };
const durMs = (tier: RaidTierId): number => raidTier(tier).durationSec * SEC;

vi.stubGlobal('fetch', () => Promise.reject(new Error('offline')));
vi.spyOn(console, 'warn').mockImplementation(() => undefined);

function game(o: { infantry?: number; slots?: readonly RaidSlot[]; lang?: 'uk' | 'en' } = {}): GameState {
  const s = createInitialState({ seed: 5, now: T0 });
  return {
    ...s,
    currencies: { ...s.currencies, ducats: Big.from(1e6) },
    village: { ...s.village, levels: { ...s.village.levels, field: 10 } },
    army: { infantry: o.infantry ?? 60 },
    raids: { ...s.raids, slots: o.slots ?? [IDLE, IDLE, IDLE] },
    settings: { ...s.settings, lang: o.lang ?? 'uk' },
  };
}

function roll(tier: RaidTierId, startedAt: number, o: Partial<RaidRoll> = {}): RaidRoll {
  return {
    region: 'porohy',
    tier,
    startedAt,
    returnAt: startedAt + durMs(tier),
    success: true,
    rumor: false,
    loot: { ducats: Big.from(500), glory: Big.from(50), pysanky: 0, relic: null },
    ...o,
  };
}

/** The store with every dispatched action recorded (what the cards send, through the store's public API). */
function mount(state: GameState, props: PanelProps = {}) {
  const store = createStore(state);
  const sent: Action[] = [];
  const recording: GameStore = {
    ...store,
    dispatch: (action, now) => {
      sent.push(action);
      return store.dispatch(action, now);
    },
  };
  const view = render(
    <GameProvider store={recording} now={() => store.getState().time.lastSeen}>
      <Panel onChooseRaid={() => undefined} {...props} />
    </GameProvider>,
  );
  if (props.initial !== 'collapsed') fireEvent.click(screen.getByRole('tab', { name: /^(Січ|Sich)/ }));
  return { store, sent, view };
}

const block = () => screen.getByRole('region', { name: 'Походи' });
const card = (n: number) => within(block()).getByRole('listitem', { name: `Загін ${String(n)}` });
const description = (el: HTMLElement): string =>
  (el.getAttribute('aria-describedby') ?? '')
    .split(' ')
    .filter(Boolean)
    .map((id) => document.getElementById(id)?.textContent ?? '')
    .join(' ');

beforeEach(() => {
  delete document.documentElement.dataset['motion'];
});
afterEach(cleanup);

describe('the block on «Січ»: one card per open slot, the army power and the relics (M3-09, Q10)', () => {
  it('two open slots, both idle at the start; the power of the army is shown', () => {
    mount(game({ infantry: 60 }));
    expect(within(block()).getAllByRole('listitem', { name: /^Загін/ })).toHaveLength(2);
    expect(within(block()).getByText('Сила війська 60')).toBeTruthy();
    // No relic yet: no badge list at all.
    expect(within(block()).queryByRole('list', { name: 'Реліквії' })).toBeNull();
  });

  it('found relics stand as badges beside the power («Пернач» also lifts the power by 5 %)', () => {
    mount({ ...game({ infantry: 61 }), relics: ['pernach'] });
    const badges = within(block()).getByRole('list', { name: 'Реліквії' });
    const items = within(badges).getAllByRole('listitem');
    expect(items.map((li) => li.textContent)).toEqual(['Пернач']);
    // The badge's name carries what the relic does.
    expect(items[0]?.getAttribute('aria-label')).toBe(
      `Пернач: Військо слухає того, хто тримає пернач: +5${NBSP}% сили.`,
    );
    // 61 × 1.05 = 64.05: the power is shown whole, rounded down.
    expect(within(block()).getByText('Сила війська 64')).toBeTruthy();
  });

  it('en: the same block in English', () => {
    mount(game({ lang: 'en' }));
    const region = screen.getByRole('region', { name: 'Raids' });
    expect(within(region).getByText('Army power 60')).toBeTruthy();
    expect(within(region).getByRole('button', { name: 'Squad 1: choose a raid' })).toBeTruthy();
  });
});

describe('idle: «Обрати похід» (§0.1 П1)', () => {
  it('opens the map for its slot', () => {
    const onChooseRaid = vi.fn();
    mount(game(), { onChooseRaid });
    fireEvent.click(within(card(2)).getByRole('button', { name: 'Загін 2: обрати похід' }));
    expect(onChooseRaid).toHaveBeenCalledWith(1);
  });

  it('no Cossack: off, and the reason is the button’s description', () => {
    mount(game({ infantry: 0 }), { onChooseRaid: vi.fn() });
    const b = within(card(1)).getByRole('button', { name: 'Загін 1: обрати похід' });
    expect(b).toHaveProperty('disabled', true);
    expect(description(b)).toBe('Спершу найми козака');
  });

  it('a list shown without the map (no onChooseRaid): no button at all — never one that does nothing (M3-11)', () => {
    mount(game(), { onChooseRaid: undefined });
    expect(within(card(1)).queryByRole('button')).toBeNull();
    expect(within(card(1)).getByText('Чекає наказу')).toBeTruthy();
  });
});

describe('on the road: tier, region, countdown, «повернуться о…», road bar (§0.1 П10)', () => {
  const raid = roll('m30', T0);
  const at = (now: number) => ({ ...game({ slots: [{ kind: 'running', raid }, IDLE, IDLE] }), time: timeAt(now) });
  const timeAt = (now: number): GameState['time'] => ({ ...game().time, lastSeen: now, maxSeen: now });

  it('names the tier and the region, two-unit countdown, the absolute return time and the road share', () => {
    mount(at(T0 + 10 * MIN + 30 * SEC));
    const c = card(1);
    expect(within(c).getByText('Дозор — Пороги')).toBeTruthy();
    // 19.5 min left reads «20 хвилин» (rounded up), never seconds before the last minute.
    expect(within(c).getByText('Ще 20 хвилин')).toBeTruthy();
    expect(within(c).getByText(/^Повернуться (завтра )?об? \d\d:\d\d$/)).toBeTruthy();
    const bar = within(c).getByRole('progressbar', { name: 'Дорога' });
    expect(bar.getAttribute('aria-valuenow')).toBe('35');
    expect(within(c).queryByRole('button')).toBeNull();
  });

  it('the last minute in seconds', () => {
    mount(at(raid.returnAt - 45 * SEC));
    expect(within(card(1)).getByText('Ще 45 секунд')).toBeTruthy();
  });

  it('the countdown follows the store’s clock (ticks), the card does not need a timer of its own', () => {
    const { store } = mount(at(raid.returnAt - 2 * MIN));
    expect(within(card(1)).getByText('Ще 2 хвилини')).toBeTruthy();
    act(() => {
      store.tick(raid.returnAt - 50 * SEC);
    });
    expect(within(card(1)).getByText('Ще 50 секунд')).toBeTruthy();
  });

  it('shows no result: a won and a lost raid read the same, and no chance (П4, M3-06)', () => {
    const texts = [true, false].map((success) => {
      const r = roll('m30', T0, {
        success,
        loot: success
          ? { ducats: Big.from(9_999), glory: Big.from(777), pysanky: 0, relic: 'pernach' }
          : { ducats: Big.from(3), glory: Big.from(1), pysanky: 0, relic: null },
      });
      const { view } = mount({ ...game({ slots: [{ kind: 'running', raid: r }, IDLE, IDLE] }), time: timeAt(T0) });
      const text = card(1).textContent;
      view.unmount();
      return text;
    });
    expect(texts[0]).toBe(texts[1]);
    expect(texts[0]).not.toMatch(/%|Пернач|9[ ,.]?999|777|шанс/i);
  });
});

describe('back: «Забрати», «Ще раз», «Забрати все» (Q9, Q17, §0.1 П12)', () => {
  const back = (tier: RaidTierId, o: Partial<RaidRoll> = {}): RaidSlot => ({
    kind: 'returned',
    raid: roll(tier, T0, o),
  });

  it('says the squad is back, without the result before the claim (П4)', () => {
    const lost = mount(game({ slots: [back('m30', { success: false }), IDLE, IDLE] }));
    const a = card(1).textContent;
    lost.view.unmount();
    const rich = { ducats: Big.from(9_999), glory: Big.from(777), pysanky: 2, relic: 'pernach' as const };
    mount(game({ slots: [back('m30', { loot: rich }), IDLE, IDLE] }));
    expect(card(1).textContent).toBe(a);
    expect(within(card(1)).getByText('Загін повернувся')).toBeTruthy();
  });

  it('«Забрати» sends claimRaid for its slot; the loot reaches the purse and the slot is free', () => {
    const { store, sent } = mount(game({ slots: [IDLE, back('m5'), IDLE] }));
    const before = store.getState().currencies.ducats;
    fireEvent.click(within(card(2)).getByRole('button', { name: 'Забрати здобич загону 2' }));
    expect(sent).toEqual([{ type: 'claimRaid', slot: 1 }]);
    expect(store.getState().currencies.ducats.sub(before).eq(500)).toBe(true);
    expect(within(card(2)).getByRole('button', { name: 'Загін 2: обрати похід' })).toBeTruthy();
    // The claim is read out (the chest window is M3-12).
    expect(within(block()).getByRole('status').textContent).toBe('Отримано: +500 дук., +50 слави');
  });

  it('«Ще раз»: the loot is in the purse and the same tier is on the road again from the same slot', () => {
    const { store } = mount(game({ slots: [back('m30'), IDLE, IDLE] }));
    const before = store.getState().currencies.ducats;
    fireEvent.click(within(card(1)).getByRole('button', { name: 'Забрати й знову вирушити: Дозор, 30 хвилин' }));
    expect(store.getState().currencies.ducats.sub(before).eq(500)).toBe(true);
    const slot = store.getState().raids.slots[0];
    expect(slot?.kind === 'running' ? slot.raid.tier : slot?.kind).toBe('m30');
    expect(within(card(1)).getByText(/^Дозор — /)).toBeTruthy();
    expect(within(card(1)).getByRole('progressbar', { name: 'Дорога' })).toBeTruthy();
    expect(within(block()).getByRole('status').textContent).toMatch(
      /^Отримано: \+500 дук\., \+50 слави Загін 1 вирушив: Дозор — /,
    );
  });

  it('a «Ще раз» the core refuses to restart: the claim stands and the status line says why', () => {
    const { store } = mount(game({ infantry: 60, slots: [back('h8'), IDLE, IDLE] }));
    act(() => {
      store.dispatch({ type: 'claimRaid', slot: 0, again: true }, T0);
    });
    expect(within(block()).getByRole('status').textContent).toBe(
      'Отримано: +500 дук., +50 слави Знову не вирушили: замало сили для цього походу',
    );
    expect(within(card(1)).getByRole('button', { name: 'Загін 1: обрати похід' })).toBeTruthy();
  });

  it('«Ще раз» is off with its reason when the army is too weak for that tier now; «Забрати» still works', () => {
    const { sent } = mount(game({ infantry: 60, slots: [back('h8'), IDLE, IDLE] }));
    const again = within(card(1)).getByRole('button', { name: /^Забрати й знову вирушити/ });
    expect(again).toHaveProperty('disabled', true);
    expect(description(again)).toBe('Замало сили для цього походу');
    fireEvent.click(again);
    expect(sent).toEqual([]);
    expect(within(card(1)).getByRole('button', { name: 'Забрати здобич загону 1' })).toHaveProperty('disabled', false);
  });

  it('«Забрати все» only from two returned raids, and it sends claimAllRaids', () => {
    const one = mount(game({ slots: [back('m5'), { kind: 'running', raid: roll('h1', T0) }, IDLE] }));
    expect(within(block()).queryByRole('button', { name: /Забрати все/ })).toBeNull();
    one.view.unmount();
    const { store, sent } = mount(game({ slots: [back('m5'), back('m30'), IDLE] }));
    const all = within(block()).getByRole('button', { name: 'Забрати все: 2 загони' });
    // The count is on the face too, and the button stands over the cards.
    expect(all.textContent).toBe('Забрати все · 2');
    expect(all.compareDocumentPosition(card(1)) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(all);
    expect(sent).toEqual([{ type: 'claimAllRaids' }]);
    expect(store.getState().raids.slots.every((x) => x.kind === 'idle')).toBe(true);
    expect(within(block()).queryByRole('button', { name: /Забрати все/ })).toBeNull();
  });
});

describe('announcements: only on a slot’s change of state, never per second (aria-live)', () => {
  it('quiet on mount and while counting down; «повернувся» once the raid is back', () => {
    const raid = roll('m5', T0);
    const s = game({ slots: [{ kind: 'running', raid }, IDLE, IDLE] });
    const { store } = mount(s);
    const status = within(block()).getByRole('status');
    expect(status.textContent).toBe('');
    act(() => {
      store.tick(T0 + MIN);
    });
    act(() => {
      store.tick(T0 + 2 * MIN);
    });
    expect(status.textContent).toBe('');
    act(() => {
      store.tick(raid.returnAt + SEC);
    });
    expect(status.textContent).toBe('Загін 1 повернувся: Розвідка — Пороги');
    // The countdown itself is in no live region.
    expect(card(1).closest('[aria-live]')).toBeNull();
  });
});

describe('the red dot on «Січ» (SPEC §6.7, §0.1 П1)', () => {
  const sichTab = () => screen.getByRole('tab', { name: /^Січ/ });
  const dot = () => sichTab().querySelector('[data-dot]');

  it('a returned raid, sheet down: the dot, said by the tab’s description too', () => {
    mount(game({ slots: [{ kind: 'returned', raid: roll('m5', T0) }, IDLE, IDLE] }), { initial: 'collapsed' });
    expect(dot()).not.toBeNull();
    expect(description(sichTab())).toBe('Похід повернувся');
  });

  it('none for idle slots or a raid still on the road, none while the sheet is open', () => {
    const idle = mount(game(), { initial: 'collapsed' });
    expect(dot()).toBeNull();
    idle.view.unmount();
    const raid = roll('m5', T0);
    const { store } = mount(game({ slots: [{ kind: 'running', raid }, IDLE, IDLE] }), { initial: 'collapsed' });
    expect(dot()).toBeNull();
    act(() => {
      store.tick(raid.returnAt);
    });
    expect(dot()).not.toBeNull();
    fireEvent.click(sichTab());
    expect(dot()).toBeNull();
  });
});

describe('focus: only the player’s own press moves it (M3-09 review)', () => {
  const back = (tier: RaidTierId): RaidSlot => ({ kind: 'returned', raid: roll(tier, T0) });

  it('a focused «Забрати» that leaves with its card: the focus stays in the block, without a scroll', () => {
    mount(game({ slots: [back('m5'), IDLE, IDLE] }));
    const focus = vi.spyOn(HTMLElement.prototype, 'focus');
    const claim = within(card(1)).getByRole('button', { name: 'Забрати здобич загону 1' });
    claim.focus();
    fireEvent.click(claim);
    expect(document.activeElement).toBe(block());
    expect(focus).toHaveBeenLastCalledWith({ preventScroll: true });
    focus.mockRestore();
  });

  it('a raid that comes back by itself never takes the focus — not from a button, not from the page', () => {
    const raid = roll('m5', T0);
    const { store } = mount(game({ slots: [{ kind: 'running', raid }, IDLE, IDLE] }));
    const tab = screen.getByRole('tab', { name: /^Січ/ });
    tab.focus();
    act(() => {
      store.tick(raid.returnAt + SEC);
    });
    expect(within(card(1)).getByText('Загін повернувся')).toBeTruthy();
    expect(document.activeElement).toBe(tab);
    tab.blur();
    expect(document.activeElement).toBe(document.body);
    act(() => {
      store.tick(raid.returnAt + 2 * SEC);
    });
    expect(document.activeElement).toBe(document.body);
  });

  it('a click without the focus (a mouse that does not focus) moves nothing either', () => {
    mount(game({ slots: [back('m5'), IDLE, IDLE] }));
    fireEvent.click(within(card(1)).getByRole('button', { name: 'Забрати здобич загону 1' }));
    expect(document.activeElement).toBe(document.body);
  });
});
