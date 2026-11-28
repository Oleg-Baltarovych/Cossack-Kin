// @vitest-environment jsdom
// The culture tree and the node card (plan M4-13, SPEC §10.3, §0.1 П1/П4): both branches drawn whole, every node with
// its ranks and state in words (its label) and an icon; a tap opens the sticky card — ranks, «зараз → після» in % and
// absolute, the fact, «Вивчити» one rank a press whatever the picker says — or the refusal in the button's
// description; arrows move focus along the tree (one tab stop). Numbers are read from `cultureView`, never written in.
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CULTURE_NODES } from '../../../src/content/culture.ts';
import { Big } from '../../../src/core/big.ts';
import { cultureView, type CultureNodeView } from '../../../src/core/culture-selectors.ts';
import { createInitialState, type GameState } from '../../../src/core/state.ts';
import { createStore, type GameStore } from '../../../src/core/store.ts';
import { formatBig } from '../../../src/i18n/index.ts';
import { Panel } from '../../../src/ui/components/Panel.tsx';
import { FROZEN_NOW, presetState } from '../../../src/ui/debug/gameDebug.ts';
import { GameProvider } from '../../../src/ui/hooks/useGame.ts';

vi.stubGlobal('fetch', () => new Promise(() => undefined));

const culture = (lang: 'uk' | 'en' = 'uk'): GameState => {
  const s = presetState('culture', 1, FROZEN_NOW);
  return { ...s, settings: { ...s.settings, lang } };
};

async function openCulture(store: GameStore, name = 'Культура'): Promise<HTMLElement> {
  render(
    <GameProvider store={store} now={() => FROZEN_NOW}>
      <Panel initial="half" />
    </GameProvider>,
  );
  fireEvent.click(screen.getByRole('tab', { name }));
  const panel = screen.getByRole('tabpanel');
  // The tab is a lazy chunk (M4-13): wait for its content.
  await within(panel).findByRole('region', { name: /^(Гілки культури|Culture branches)$/ });
  return panel;
}

const nodeOf = (s: GameState, pick: (n: CultureNodeView) => boolean): CultureNodeView => {
  const n = cultureView(s)
    .branches.flatMap((b) => b.nodes)
    .find(pick);
  if (!n) throw new Error('no such node in the view');
  return n;
};

const button = (panel: HTMLElement, id: string): HTMLButtonElement => {
  const b = panel.querySelector<HTMLButtonElement>(`[data-node="${id}"]`);
  if (!b) throw new Error(`no node ${id}`);
  return b;
};

const card = (): HTMLElement => {
  const c = document.querySelector<HTMLElement>('[data-card]');
  if (!c) throw new Error('no card');
  return c;
};

const reason = (b: HTMLElement): string | null | undefined =>
  document.getElementById(b.getAttribute('aria-describedby') ?? '')?.textContent;

afterEach(cleanup);

describe('culture tree (M4-13)', () => {
  it('both branches whole: six nodes each, root → 2 → 2 → top, each with its ranks and state in its label', async () => {
    const s = culture();
    const panel = await openCulture(createStore(s));
    for (const name of ['Музика', 'Звичаї']) {
      const group = within(panel).getByRole('group', { name });
      expect(within(group).getAllByRole('button')).toHaveLength(6);
    }
    const learnable = nodeOf(s, (n) => n.blocked === null);
    expect(button(panel, learnable.id).getAttribute('aria-label')).toMatch(/: ранг 0 з \d+, можна вивчити$/);
    const blocked = nodeOf(s, (n) => n.blocked === 'prereq');
    expect(button(panel, blocked.id).getAttribute('aria-label')).toContain('спершу попередній вузол');
    // Not by colour alone: the lock beside the ranks of a node out of reach, glory beside one to learn now.
    expect(button(panel, blocked.id).querySelector('[data-icon="lock"]')).not.toBeNull();
    expect(button(panel, learnable.id).querySelector('[data-icon="glory"]')).not.toBeNull();
    expect(button(panel, blocked.id).textContent).toContain(`0/${String(blocked.maxRank)}`);
  });

  it('a closed branch: its condition, every node closed — still shown whole', async () => {
    const panel = await openCulture(createStore(createInitialState({ seed: 5, now: FROZEN_NOW })));
    const music = within(panel).getByRole('group', { name: 'Музика' });
    expect(music.textContent).toContain('Відкриється, коли в передмісті стане шинок');
    for (const b of within(music).getAllByRole('button'))
      expect(b.getAttribute('aria-label')).toContain('гілка закрита');
    fireEvent.click(button(panel, 'music.dumy'));
    const learn = within(card()).getByRole<HTMLButtonElement>('button', { name: /^Вивчити/ });
    expect(learn.disabled).toBe(true);
    expect(reason(learn)).toBe('Відкриється, коли в передмісті стане шинок');
  });

  it('a tap opens the card: ranks, effect now → after in % and absolute, the fact; «Вивчити» buys one rank', async () => {
    const s = culture();
    const store = createStore(s);
    const panel = await openCulture(store);
    const n = nodeOf(s, (x) => x.blocked === null && x.effects.some((e) => e.amount !== null));
    const b = button(panel, n.id);
    fireEvent.click(b);
    expect(b.getAttribute('aria-expanded')).toBe('true');
    expect(b.getAttribute('aria-controls')).toBe(card().id);
    const c = card();
    expect(c.textContent).toContain(`Ранг 0/${String(n.maxRank)}`);
    expect(c.textContent).toMatch(/\+0\s%\s→\s\+\d/);
    // The absolute number under the percent (П4).
    // The absolute number after the percent, on the same line (П4).
    const line = within(c)
      .getAllByRole('listitem')
      .find((li) => li.textContent.includes(' · '));
    expect(line?.textContent).toMatch(/^\+0\s%\s→\s\+\d.* · .+ → .+$/);
    const name = c.querySelector('p')?.textContent ?? '';
    expect(b.getAttribute('aria-label')).toContain(name);
    const price = n.price ? formatBig(n.price, 'uk', s.settings.numberFormat) : '';
    const learn = within(c).getByRole<HTMLButtonElement>('button', {
      name: `Вивчити «${name}», ранг 1, за ${price} слави`,
    });
    expect(learn.textContent).toContain('Вивчити +1');
    fireEvent.click(learn);
    expect(store.getState().culture[n.id]).toBe(1);
    expect(card().textContent).toContain(`Ранг 1/${String(n.maxRank)}`);
  });

  it('the fact of the node is on its card', async () => {
    const panel = await openCulture(createStore(culture()));
    fireEvent.click(button(panel, 'music.bandura'));
    expect(card().textContent).toContain('Бандура — багатострунний щипковий інструмент');
  });

  it('×10 on the shared picker: a node still learns one rank a press', async () => {
    const s = culture();
    const store = createStore(s);
    const panel = await openCulture(store);
    fireEvent.click(within(panel).getByRole('button', { name: '×10' }));
    const n = nodeOf(s, (x) => x.blocked === null);
    fireEvent.click(button(panel, n.id));
    const learn = within(card()).getByRole('button', { name: /^Вивчити/ });
    expect(learn.textContent).toContain('+1');
    fireEvent.click(learn);
    expect(store.getState().culture[n.id]).toBe(1);
  });

  it('refusals: a prerequisite names the nodes it waits for («або» / «і»); glory; the top rank', async () => {
    const s = culture();
    const panel = await openCulture(createStore(s));
    fireEvent.click(button(panel, 'music.bandura'));
    let learn = within(card()).getByRole<HTMLButtonElement>('button', { name: /^Вивчити/ });
    expect(learn.disabled).toBe(true);
    expect(reason(learn)).toBe('Спершу вивчіть «Пісні на майдані» або «Думи про походи»');
    fireEvent.click(button(panel, 'music.great'));
    learn = within(card()).getByRole<HTMLButtonElement>('button', { name: /^Вивчити/ });
    expect(reason(learn)).toBe('Спершу вивчіть «Бандура в курені» і «Лірники на шляху»');
    cleanup();

    const poor = await openCulture(createStore({ ...s, currencies: { ...s.currencies, glory: Big.from(0) } }));
    fireEvent.click(button(poor, 'music.maidan'));
    learn = within(card()).getByRole<HTMLButtonElement>('button', { name: /^Вивчити/ });
    expect(learn.disabled).toBe(true);
    expect(reason(learn)).toBe('Бракує слави');
    expect(button(poor, 'music.maidan').getAttribute('aria-label')).toContain('бракує слави');
    cleanup();

    const dumy = CULTURE_NODES.find((x) => x.id === 'music.dumy');
    const top = await openCulture(createStore({ ...s, culture: { ...s.culture, 'music.dumy': dumy?.maxRank ?? 0 } }));
    fireEvent.click(button(top, 'music.dumy'));
    learn = within(card()).getByRole<HTMLButtonElement>('button', { name: 'Вивчити «Кобзарські думи»' });
    expect(learn.disabled).toBe(true);
    expect(reason(learn)).toBe('Найвищий ранг');
    expect(card().textContent).not.toContain('→');
    expect(button(top, 'music.dumy').querySelector('[data-icon="milestone"]')).not.toBeNull();
  });

  it('keyboard: one tab stop, arrows move focus along the tree; the card closes back to its node', async () => {
    const panel = await openCulture(createStore(culture()));
    const stops = [...panel.querySelectorAll<HTMLElement>('[data-node]')].filter((b) => b.tabIndex === 0);
    expect(stops.map((b) => b.dataset['node'])).toEqual(['music.dumy']);
    const root = button(panel, 'music.dumy');
    root.focus();
    fireEvent.keyDown(root, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(button(panel, 'music.maidan'));
    fireEvent.keyDown(document.activeElement ?? root, { key: 'ArrowRight' });
    const campaign = button(panel, 'music.campaign');
    expect(document.activeElement).toBe(campaign);
    expect(campaign.tabIndex).toBe(0);
    expect(root.tabIndex).toBe(-1);
    fireEvent.click(campaign);
    fireEvent.click(within(card()).getByRole('button', { name: 'Закрити картку вузла' }));
    expect(document.querySelector('[data-card]')).toBeNull();
    expect(document.activeElement).toBe(campaign);
    expect(campaign.getAttribute('aria-expanded')).toBe('false');
  });

  it('en: labels, the card and the refusal read in English', async () => {
    const panel = await openCulture(createStore(culture('en')), 'Culture');
    expect(within(panel).getByRole('group', { name: 'Music' })).toBeDefined();
    fireEvent.click(button(panel, 'music.bandura'));
    const learn = within(card()).getByRole('button', { name: /^Learn/ });
    expect(reason(learn)).toBe('Learn Songs on the maidan or Dumas of campaigns first');
    expect(card().textContent).toContain('Rank 0/');
    fireEvent.click(button(panel, 'music.great'));
    expect(reason(within(card()).getByRole('button', { name: /^Learn/ }))).toBe(
      'Learn A bandura in the kurin and Lirnyks on the road first',
    );
  });

  it('a node learned in a branch that is closed (e.g. after a migration): its rank, the lock, the branch condition', async () => {
    const s = createInitialState({ seed: 5, now: FROZEN_NOW });
    const panel = await openCulture(createStore({ ...s, culture: { 'music.dumy': 2 } }));
    const dumy = button(panel, 'music.dumy');
    expect(dumy.getAttribute('aria-label')).toMatch(/: ранг 2 з \d+, гілка закрита$/);
    expect(dumy.textContent).toContain('2/');
    expect(dumy.querySelector('[data-icon="lock"]')).not.toBeNull();
    const music = within(panel).getByRole('group', { name: 'Музика' });
    expect(music.textContent).toContain('Відкриється, коли в передмісті стане шинок');
    fireEvent.click(dumy);
    expect(card().textContent).toContain('Ранг 2/');
    const learn = within(card()).getByRole<HTMLButtonElement>('button', { name: /^Вивчити/ });
    expect(learn.disabled).toBe(true);
    expect(reason(learn)).toBe('Відкриється, коли в передмісті стане шинок');
  });

  it('the fact: two lines until tapped (aria-expanded), the whole text always in the DOM', async () => {
    const panel = await openCulture(createStore(culture()));
    fireEvent.click(button(panel, 'music.bandura'));
    const fact = within(card()).getByRole('button', { name: /^Бандура — / });
    expect(fact.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(fact);
    expect(fact.getAttribute('aria-expanded')).toBe('true');
  });

  it('the ×1/×10/×25/Max picker stands in the «Герої» block on this tab, not above the tree', async () => {
    const panel = await openCulture(createStore(culture()));
    const heroes = within(panel).getByRole('region', { name: 'Герої' });
    expect(within(heroes).getByRole('group', { name: 'Скільки купувати' })).toBeDefined();
    expect(within(panel).getAllByRole('group', { name: 'Скільки купувати' })).toHaveLength(1);
  });
});
