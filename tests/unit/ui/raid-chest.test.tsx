// @vitest-environment jsdom
// The raid's chest window (plan M3-12, §0.1 П4/П11/П12): a claim opens it; the chest shakes, then the loot comes out
// one piece at a time (a relic as its own beat); a tap or Enter shows all at once; «Забрати» closes it from the first
// frame and sends the coins; «менше руху» = the finished list, no shake, no coins; «Забрати все» = one window with a
// part per squad; a failure says why it brought less. The loot shown is exactly what the core granted.
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// A no-break space keeps «+5 %» on one line (M3-12 review).
import { NBSP } from '../../../src/i18n/index.ts';
import { RAID_REVEAL } from '../../../src/content/juice.ts';
import type { RaidTierId } from '../../../src/content/raids.ts';
import { Big } from '../../../src/core/big.ts';
import { createInitialState, type GameState } from '../../../src/core/state.ts';
import { createStore, type GameStore } from '../../../src/core/store.ts';
import { raidTier, type RaidRoll, type RaidSlot } from '../../../src/core/systems/raids.ts';
import { formatBig } from '../../../src/i18n/index.ts';
import { GameUi } from '../../../src/ui/App.tsx';
import { GameProvider } from '../../../src/ui/hooks/useGame.ts';

const T0 = 1_763_400_000_000;
const IDLE: RaidSlot = { kind: 'idle' };

vi.stubGlobal('fetch', () => Promise.reject(new Error('offline')));
vi.spyOn(console, 'warn').mockImplementation(() => undefined);

function roll(tier: RaidTierId, o: Partial<RaidRoll> = {}): RaidRoll {
  return {
    region: 'porohy',
    tier,
    startedAt: T0 - raidTier(tier).durationSec * 1000,
    returnAt: T0,
    success: true,
    rumor: false,
    loot: { ducats: Big.from(2e6), glory: Big.from(3e5), pysanky: 0, relic: null },
    ...o,
  };
}

function game(slots: readonly RaidSlot[], lang: 'uk' | 'en' = 'uk'): GameState {
  const s = createInitialState({ seed: 5, now: T0 });
  return {
    ...s,
    village: { ...s.village, levels: { ...s.village.levels, field: 10 } },
    army: { infantry: 60 },
    raids: { ...s.raids, slots },
    story: { seen: ['khortytsia.shore'] },
    settings: { ...s.settings, lang },
  };
}

const back = (o: Partial<RaidRoll> = {}, tier: RaidTierId = 'h4'): RaidSlot => ({
  kind: 'returned',
  raid: roll(tier, o),
});
const relicRoll: Partial<RaidRoll> = {
  loot: { ducats: Big.from(2e6), glory: Big.from(3e5), pysanky: 2, relic: 'pernach' },
};

function mount(state: GameState): GameStore {
  const store = createStore(state);
  render(
    <GameProvider store={store} now={() => T0}>
      <GameUi world={null} notice="none" />
    </GameProvider>,
  );
  fireEvent.click(screen.getByRole('tab', { name: /^(Січ|Sich)/ }));
  return store;
}

const chest = () => screen.getByRole('dialog', { name: /^Здобич/ });
/** The dim around the window (no role: a tap there is the same as a tap in the window). */
const backdrop = (): HTMLElement => chest().parentElement ?? document.body;
const shownKinds = (box: HTMLElement): string[] =>
  [...box.querySelectorAll<HTMLElement>('[data-item][data-shown]')].map((el) => el.dataset['item'] ?? '');
/** The dialog's description (aria-describedby), as a screen reader gets it. */
const description = (el: HTMLElement): string =>
  document.getElementById(el.getAttribute('aria-describedby') ?? '')?.textContent ?? '';
/** Shown = on screen and not hidden from assistive tech (the CSS keeps the unshown ones invisible). */
const told = (el: HTMLElement): boolean => el.hasAttribute('data-shown') && el.getAttribute('aria-hidden') !== 'true';
const step = (ms: number): void => {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
};

beforeEach(() => {
  vi.useFakeTimers();
  // jsdom has no scrolling: the relic's card asks for it on its beat.
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  delete document.documentElement.dataset['motion'];
});

describe('the chest window (M3-12)', () => {
  it('a claim opens it: the shake, then ducats, glory, pysanky one step apart, then the relic as its own beat', () => {
    const store = mount(game([back(relicRoll), IDLE, IDLE]));
    fireEvent.click(screen.getByRole('button', { name: 'Забрати здобич загону 1' }));
    const box = chest();
    expect(box.getAttribute('aria-labelledby')).not.toBeNull();
    screen.getByRole('dialog', { name: 'Здобич походу' });
    // Granted at once by the core; the window only shows it — and it is hidden while the chest shakes.
    expect(store.getState().relics).toEqual(['pernach']);
    expect(box.getAttribute('data-reveal')).toBe('shake');
    expect(box.querySelector('[data-phase="shake"]')).not.toBeNull();
    expect(shownKinds(box)).toEqual([]);
    expect(told(within(box).getByText('Удача: уся здобич'))).toBe(false);
    // The screen reader has the whole loot from the first frame.
    const ducats = formatBig(Big.from(2e6), 'uk', 'words');
    const glory = formatBig(Big.from(3e5), 'uk', 'words');
    expect(description(box)).toBe(
      `Загін 1 · Похід — Пороги. Удача: уся здобич: +${ducats} дук., +${glory} слави, +2 писанки, реліквія «Пернач».`,
    );
    expect(document.activeElement).toBe(within(box).getByRole('button', { name: 'Забрати' }));

    step(RAID_REVEAL.shakeMs);
    expect(box.querySelector('[data-phase="open"]')).not.toBeNull();
    expect(shownKinds(box)).toEqual(['ducats']);
    expect(told(within(box).getByText('Удача: уся здобич'))).toBe(true);
    step(RAID_REVEAL.itemStepMs);
    expect(shownKinds(box)).toEqual(['ducats', 'glory']);
    step(RAID_REVEAL.itemStepMs);
    expect(shownKinds(box)).toEqual(['ducats', 'glory', 'pysanky']);
    step(RAID_REVEAL.itemStepMs);
    expect(shownKinds(box)).toEqual(['ducats', 'glory', 'pysanky', 'relic']);
    const relic = box.querySelector<HTMLElement>('[data-item="relic"]');
    expect(relic?.textContent).toContain('Знайдено реліквію!');
    expect(relic?.textContent).toContain('Пернач');
    expect(relic?.textContent).toContain(`+5${NBSP}% сили`);
    expect(relic?.textContent).toContain('знаком влади');
    expect(box.getAttribute('data-reveal')).toBe('done');
  });

  it('a tap anywhere but «Забрати» — the window or the dim around it — or Enter off the button shows everything', () => {
    for (const target of [(box: HTMLElement) => box.querySelector('[data-claim="0"] p') ?? box, () => backdrop()]) {
      mount(game([back(relicRoll), IDLE, IDLE]));
      fireEvent.click(screen.getByRole('button', { name: 'Забрати здобич загону 1' }));
      // A browser moves the focus off «Забрати» to the page on a press on plain text: as here.
      within(chest()).getByRole('button', { name: 'Забрати' }).blur();
      fireEvent.click(target(chest()));
      expect(shownKinds(chest())).toEqual(['ducats', 'glory', 'pysanky', 'relic']);
      expect(chest().getAttribute('data-reveal')).toBe('done');
      // «Забрати» takes the focus back, so the next Enter closes.
      expect(document.activeElement).toBe(within(chest()).getByRole('button', { name: 'Забрати' }));
      cleanup();
    }
    mount(game([back(relicRoll), IDLE, IDLE]));
    fireEvent.click(screen.getByRole('button', { name: 'Забрати здобич загону 1' }));
    fireEvent.keyDown(chest(), { key: ' ' });
    expect(chest().getAttribute('data-reveal')).toBe('done');
  });

  it('Enter or Space on the focused «Забрати» closes at once, mid-reveal (the key is the button’s own)', () => {
    for (const key of ['Enter', ' ']) {
      mount(game([back(relicRoll), IDLE, IDLE]));
      fireEvent.click(screen.getByRole('button', { name: 'Забрати здобич загону 1' }));
      const ok = within(chest()).getByRole('button', { name: 'Забрати' });
      expect(document.activeElement).toBe(ok);
      // Not swallowed: the browser turns it into the button's click.
      expect(fireEvent.keyDown(ok, { key })).toBe(true);
      expect(chest().getAttribute('data-reveal')).toBe('shake');
      fireEvent.click(ok);
      expect(screen.queryByRole('dialog')).toBeNull();
      cleanup();
    }
  });

  it('a claim that brought nothing to list still tells its outcome (no empty loot list)', () => {
    const empty = back({ success: false, loot: { ducats: Big.from(0), glory: Big.from(0), pysanky: 0, relic: null } });
    mount(game([back(), empty, IDLE]));
    fireEvent.click(screen.getByRole('button', { name: 'Забрати все: 2 загони' }));
    step(RAID_REVEAL.shakeMs);
    const part = within(chest()).getAllByRole('region')[1] as HTMLElement;
    expect(told(within(part).getByText('Повернулися з частиною здобичі'))).toBe(true);
    expect(within(part).queryByRole('list')).toBeNull();
  });

  it('the relic’s card is scrolled into view on its beat; at once under «менше руху»', () => {
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    mount(game([back(relicRoll), IDLE, IDLE]));
    fireEvent.click(screen.getByRole('button', { name: 'Забрати здобич загону 1' }));
    expect(scroll).not.toHaveBeenCalled();
    step(RAID_REVEAL.shakeMs + 3 * RAID_REVEAL.itemStepMs);
    expect(scroll).toHaveBeenCalledWith({ block: 'nearest', behavior: 'smooth' });
    cleanup();
    scroll.mockClear();
    document.documentElement.dataset['motion'] = 'reduced';
    mount(game([back(relicRoll), IDLE, IDLE]));
    fireEvent.click(screen.getByRole('button', { name: 'Забрати здобич загону 1' }));
    expect(scroll).toHaveBeenCalledWith({ block: 'nearest', behavior: 'auto' });
  });

  it('«Забрати» works from the first frame: closes mid-shake, the coins fly, the focus goes back to the block', () => {
    mount(game([back(), IDLE, IDLE]));
    const claim = screen.getByRole('button', { name: 'Забрати здобич загону 1' });
    claim.focus();
    fireEvent.click(claim);
    expect(chest().getAttribute('data-reveal')).toBe('shake');
    expect(document.querySelectorAll('[data-coin]')).toHaveLength(0);
    fireEvent.click(within(chest()).getByRole('button', { name: 'Забрати' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.querySelectorAll('[data-coin="ducats"]').length).toBeGreaterThan(0);
    expect(document.querySelectorAll('[data-coin="glory"]').length).toBeGreaterThan(0);
    expect(document.activeElement).toBe(screen.getByRole('region', { name: 'Походи' }));
  });

  it('Esc closes it like the button; Tab stays inside; the rest of the UI is inert meanwhile', () => {
    mount(game([back(), IDLE, IDLE]));
    fireEvent.click(screen.getByRole('button', { name: 'Забрати здобич загону 1' }));
    const ok = within(chest()).getByRole('button', { name: 'Забрати' });
    expect(screen.getByRole('banner').closest('[inert]')).not.toBeNull();
    fireEvent.keyDown(ok, { key: 'Tab' });
    expect(document.activeElement).toBe(ok);
    fireEvent.keyDown(ok, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('banner').closest('[inert]')).toBeNull();
  });

  it('«менше руху»: the finished list at once — no shake, no coins', () => {
    document.documentElement.dataset['motion'] = 'reduced';
    mount(game([back(relicRoll), IDLE, IDLE]));
    fireEvent.click(screen.getByRole('button', { name: 'Забрати здобич загону 1' }));
    const box = chest();
    expect(box.getAttribute('data-reveal')).toBe('done');
    expect(box.querySelector('[data-phase="shake"]')).toBeNull();
    expect(shownKinds(box)).toEqual(['ducats', 'glory', 'pysanky', 'relic']);
    fireEvent.click(within(box).getByRole('button', { name: 'Забрати' }));
    expect(document.querySelectorAll('[data-coin]')).toHaveLength(0);
  });

  it('«Забрати все»: one window, a part per squad; the failed one says it came back with part of the loot', () => {
    const failed = back(
      { success: false, loot: { ducats: Big.from(600), glory: Big.from(90), pysanky: 0, relic: null } },
      'm30',
    );
    mount(game([back(), failed, IDLE]));
    fireEvent.click(screen.getByRole('button', { name: 'Забрати все: 2 загони' }));
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    const box = screen.getByRole('dialog', { name: 'Здобич 2 походів' });
    fireEvent.click(box);
    const parts = within(box).getAllByRole('region');
    expect(parts.map((p) => p.getAttribute('aria-label')?.split(' · ')[0])).toEqual(['Загін 1', 'Загін 2']);
    expect(told(within(parts[0] as HTMLElement).getByText('Удача: уся здобич'))).toBe(true);
    expect(told(within(parts[1] as HTMLElement).getByText('Повернулися з частиною здобичі'))).toBe(true);
    expect(
      within(parts[1] as HTMLElement)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['+600 дук.', '+90 слави']);
  });

  it('English, with its plurals', () => {
    mount(game([back(), back({}, 'm30'), IDLE], 'en'));
    fireEvent.click(screen.getByRole('button', { name: /^Collect all/ }));
    const box = screen.getByRole('dialog', { name: 'Loot of 2 raids' });
    expect(box.textContent).not.toMatch(/\p{Script=Cyrillic}/u);
    within(box).getByRole('button', { name: 'Collect' });
  });
});
