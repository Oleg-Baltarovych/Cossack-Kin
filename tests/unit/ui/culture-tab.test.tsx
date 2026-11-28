// @vitest-environment jsdom
// The «Культура» tab (plan M4-12, SPEC §10.3): between «Січ» and «Ще», the «Герої» block on top — a card per hero who
// came (level of the cap, each effect «зараз → після» for the shared picker, «Підвищити» with its price, the refusal in
// its description), a silhouette and «Прийде, коли…» for one who did not — the branch trees below (M4-13), and the red dot from
// core `cultureClaimable` while the sheet is down.
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Big } from '../../../src/core/big.ts';
import { cultureClaimable, heroesView } from '../../../src/core/culture-selectors.ts';
import { createInitialState, type GameState } from '../../../src/core/state.ts';
import { createStore, type GameStore } from '../../../src/core/store.ts';
import { formatBig, NBSP } from '../../../src/i18n/index.ts';
import { Panel } from '../../../src/ui/components/Panel.tsx';
import { FROZEN_NOW, presetState } from '../../../src/ui/debug/gameDebug.ts';
import { GameProvider } from '../../../src/ui/hooks/useGame.ts';

vi.stubGlobal('fetch', () => new Promise(() => undefined));

const culture = (lang: 'uk' | 'en' = 'uk'): GameState => {
  const s = presetState('culture', 1, FROZEN_NOW);
  return { ...s, settings: { ...s.settings, lang } };
};

function mount(store: GameStore, initial: 'half' | 'collapsed' = 'half') {
  render(
    <GameProvider store={store} now={() => FROZEN_NOW}>
      <Panel initial={initial} />
    </GameProvider>,
  );
}

async function openCulture(store: GameStore, name = 'Культура'): Promise<HTMLElement> {
  mount(store);
  fireEvent.click(screen.getByRole('tab', { name }));
  const panel = screen.getByRole('tabpanel');
  // The tab is a lazy chunk (M4-13): wait for its content.
  await within(panel).findByRole('region', { name: /^(Гілки культури|Culture branches)$/ });
  return panel;
}

const card = (panel: HTMLElement, id: string): HTMLElement => {
  const li = panel.querySelector<HTMLElement>(`[data-hero="${id}"]`);
  if (!li) throw new Error(`no card ${id}`);
  return li;
};

afterEach(cleanup);

describe('«Культура» tab (M4-12)', () => {
  it('stands between «Січ» and «Ще»', () => {
    mount(createStore(culture()));
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Хутір', 'Січ', 'Культура', 'Ще']);
  });

  it('a hero who came: level of the cap, effect now → after, «Підвищити» for the picker’s count and price', async () => {
    const store = createStore(culture());
    const panel = await openCulture(store);
    const heroes = within(panel).getByRole('region', { name: 'Герої' });
    expect(
      within(heroes)
        .getAllByRole('listitem')
        .filter((li) => li.dataset['hero']),
    ).toHaveLength(3);
    const otaman = card(panel, 'otaman');
    expect(otaman.textContent).toContain('Кошовий отаман');
    expect(otaman.textContent).toContain('Рів. 4/25');
    // 2 % a level (content): 8 % now, 10 % after one more.
    expect(otaman.textContent).toContain(`+8${NBSP}% → +10${NBSP}% сили війська`);
    const v = heroesView(store.getState(), 1).find((h) => h.id === 'otaman');
    const price = v?.price ? formatBig(v.price, 'uk', store.getState().settings.numberFormat) : '';
    const button = within(otaman).getByRole<HTMLButtonElement>('button', {
      name: `Підвищити «Кошовий отаман» на 1 рів. за ${price} слави`,
    });
    expect(button.disabled).toBe(false);
    // The count it buys is on the button itself; no reason line while it can be pressed.
    expect(button.textContent).toContain('Підвищити +1');
    expect(button.getAttribute('aria-describedby')).toBeNull();
    fireEvent.click(button);
    expect(store.getState().heroes.otaman).toBe(5);
    expect(card(panel, 'otaman').textContent).toContain('Рів. 5/25');
  });

  it('×10 too dear: the button is off and says why (aria-describedby); the button names the ×10', async () => {
    const store = createStore(culture());
    const panel = await openCulture(store);
    fireEvent.click(within(panel).getByRole('button', { name: '×10' }));
    expect(heroesView(store.getState(), 10).find((h) => h.id === 'otaman')?.blocked).toBe('glory');
    const otaman = card(panel, 'otaman');
    const button = within(otaman).getByRole<HTMLButtonElement>('button', { name: /^Підвищити/ });
    expect(button.disabled).toBe(true);
    const note = document.getElementById(button.getAttribute('aria-describedby') ?? '');
    expect(note?.textContent).toBe('Бракує слави');
    expect(button.getAttribute('aria-label')).toContain('на 10 рів.');
    expect(button.textContent).toContain('Підвищити +10');
    expect(otaman.textContent).toContain(`+8${NBSP}% → +28${NBSP}% сили війська`);
  });

  it('reductions read as what they are, never as a minus range (M4-12 review)', async () => {
    const panel = await openCulture(createStore(culture()));
    expect(card(panel, 'kobzar').textContent).toContain(`знижка 1${NBSP}% → 2${NBSP}% на культуру`);
    expect(card(panel, 'kharakternyk').textContent).toContain(`походи коротші: 1${NBSP}% → 2${NBSP}%`);
    expect(panel.textContent).not.toMatch(/-\d/);
  });

  it('a hero at the cap: the button off, «Найвищий рівень» in its description, the effect without an arrow', async () => {
    const s = culture();
    const panel = await openCulture(createStore({ ...s, heroes: { ...s.heroes, kobzar: 25 } }));
    const kobzar = card(panel, 'kobzar');
    const button = within(kobzar).getByRole<HTMLButtonElement>('button', { name: 'Підвищити «Кобзар»' });
    expect(button.disabled).toBe(true);
    expect(document.getElementById(button.getAttribute('aria-describedby') ?? '')?.textContent).toBe('Найвищий рівень');
    expect(kobzar.textContent).toContain(`знижка 25${NBSP}% на культуру`);
    expect(kobzar.textContent).not.toContain('→');
  });

  it('a hero who has not come: a silhouette, no name, no button, and when he comes', async () => {
    const s = createInitialState({ seed: 5, now: FROZEN_NOW });
    const panel = await openCulture(createStore(s));
    for (const id of ['otaman', 'kobzar', 'kharakternyk']) {
      const li = card(panel, id);
      expect(li.textContent).toContain('Невідомий гість');
      expect(li.querySelector('[data-silhouette]')).not.toBeNull();
      expect(within(li).queryByRole('button')).toBeNull();
    }
    expect(card(panel, 'otaman').textContent).toContain('Прийде, коли Майдан сягне рівня 10');
    expect(card(panel, 'kharakternyk').textContent).toContain('Прийде на Січ після перемог у походах: 15');
    expect(panel.textContent).not.toContain('Кошовий отаман');
  });

  it('the branches: how far each is learned, or the lock and when it opens', async () => {
    const open = await openCulture(createStore(culture()));
    const region = within(open).getByRole('region', { name: 'Гілки культури' });
    expect(within(region).getByRole('group', { name: 'Музика' }).textContent).toContain('Вивчено 1 з 6');
    expect(within(region).getByRole('group', { name: 'Звичаї' }).textContent).toContain('Вивчено 1 з 6');
    cleanup();
    const closed = await openCulture(createStore(createInitialState({ seed: 5, now: FROZEN_NOW })));
    const shut = within(closed).getByRole('region', { name: 'Гілки культури' });
    expect(shut.textContent).toContain('Відкриється, коли в передмісті стане шинок');
    expect(shut.textContent).toContain('Відкриється, коли на Січі стане церква');
  });

  it('en: the tab, the level and the button read in English', async () => {
    const panel = await openCulture(createStore(culture('en')), 'Culture');
    const otaman = card(panel, 'otaman');
    expect(otaman.textContent).toContain('Lv 4/25');
    expect(otaman.textContent).toContain(`+8${NBSP}% → +10${NBSP}% army power`);
    expect(within(otaman).getByRole('button', { name: /^Level up Koshovyi otaman by 1 lv for / })).toBeDefined();
  });
});

describe('red dot on «Культура» (M4-12, Q13)', () => {
  const dot = () => screen.getByRole('tab', { name: 'Культура' }).querySelector('[data-dot]');

  it('the sheet down and something new to take: the dot, said in the tab’s description', () => {
    const s = culture();
    expect(cultureClaimable(s)).toBe(true);
    mount(createStore(s), 'collapsed');
    expect(dot()).not.toBeNull();
    const tab = screen.getByRole('tab', { name: 'Культура' });
    expect(document.getElementById(tab.getAttribute('aria-describedby') ?? '')?.textContent).toBe('Нове в культурі');
  });

  it('nothing new to take (no glory): no dot; and none while the sheet is open', () => {
    const rich = culture();
    const poor = { ...rich, currencies: { ...rich.currencies, glory: Big.from(0) } };
    expect(cultureClaimable(poor)).toBe(false);
    mount(createStore(poor), 'collapsed');
    expect(dot()).toBeNull();
    cleanup();
    mount(createStore(rich), 'half');
    expect(dot()).toBeNull();
  });
});
