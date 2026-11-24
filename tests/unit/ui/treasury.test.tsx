// @vitest-environment jsdom
// «Ще → Скарбниця» (plan M3-12, §0.1 П5, SPEC §3.4): the relic collection — found ones with their bonus and fact,
// unfound ones as a silhouette with where to look (from the shortest tier that can find one) and, when the pity makes
// the next find sure, «реліквія близько» — the same fact as the map card.
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
// A no-break space keeps «+5 %» on one line (M3-12 review).
import { NBSP } from '../../../src/i18n/index.ts';
import { pityThreshold, RELIC_DEFS, type RelicId } from '../../../src/content/relics.ts';
import { createInitialState, type GameState } from '../../../src/core/state.ts';
import { createStore } from '../../../src/core/store.ts';
import { Panel } from '../../../src/ui/components/Panel.tsx';
import { GameProvider } from '../../../src/ui/hooks/useGame.ts';

const T0 = 1_763_400_000_000;

vi.stubGlobal('fetch', () => Promise.reject(new Error('offline')));
vi.spyOn(console, 'warn').mockImplementation(() => undefined);

function game(relics: readonly RelicId[], pity = 0, lang: 'uk' | 'en' = 'uk'): GameState {
  const s = createInitialState({ seed: 5, now: T0 });
  return { ...s, relics, raids: { ...s.raids, pity }, settings: { ...s.settings, lang } };
}

function mount(state: GameState) {
  render(
    <GameProvider store={createStore(state)} now={() => T0}>
      <Panel />
    </GameProvider>,
  );
  fireEvent.click(screen.getByRole('tab', { name: /^(Ще|More)/ }));
  return screen.getByRole('region', { name: /^(Скарбниця|Treasury)$/ });
}

afterEach(cleanup);

describe('Скарбниця (M3-12)', () => {
  it('a found relic: its name, its bonus and fact; an unfound one: a silhouette and where to look', () => {
    const box = mount(game(['porokhivnytsia']));
    expect(box.textContent).toContain(`Знайдено 1 з ${String(RELIC_DEFS.length)}`);
    const items = within(within(box).getByRole('list', { name: 'Реліквії' })).getAllByRole('listitem');
    expect(items).toHaveLength(RELIC_DEFS.length);
    const [pernach, flask] = items as [HTMLElement, HTMLElement];
    expect(flask.textContent).toContain('Порохівниця');
    expect(flask.textContent).toContain(`+10${NBSP}% здобичі`);
    expect(flask.textContent).toContain('з рогу');
    expect(flask.querySelector('[data-icon="porokhivnytsia"]')).not.toBeNull();
    // The unfound one gives away neither its name nor its bonus — only its outline and the hint.
    expect(pernach.textContent).toContain('Невідома реліквія');
    expect(pernach.textContent).toContain('Трапляється в походах від 30 хвилин');
    expect(pernach.textContent).not.toContain('Пернач');
    expect(pernach.textContent).not.toContain('сили');
    expect(pernach.querySelector('[data-icon="pernach-unknown"]')).not.toBeNull();
    expect(box.textContent).not.toContain('реліквія близько');
  });

  it('the pity: one qualifying success short — «Старі козаки кажуть: реліквія близько»', () => {
    const box = mount(game([], pityThreshold(0) - 1));
    expect(box.textContent).toContain('Знайдено 0 з');
    expect(box.textContent).toContain('Старі козаки кажуть: реліквія близько');
  });

  it('every relic found: says so, no hint; English', () => {
    const all = RELIC_DEFS.map((r) => r.id);
    const box = mount(game(all));
    expect(box.textContent).toContain('Усі реліквії краю знайдено');
    expect(box.textContent).not.toContain('Трапляється');
    cleanup();
    const en = mount(game([], 0, 'en'));
    expect(en.textContent).toContain('Found 0 of');
    expect(en.textContent).toContain('Unknown relic');
    expect(en.textContent).not.toMatch(/\p{Script=Cyrillic}/u);
  });
});
