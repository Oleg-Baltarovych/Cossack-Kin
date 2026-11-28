// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { OFFLINE } from '../../../src/content/economy.ts';
import { Big } from '../../../src/core/big.ts';
import { KHORTYTSIA } from '../../../src/content/villages/khortytsia.ts';
import { applyOffline } from '../../../src/core/offline.ts';
import { formatBig } from '../../../src/i18n/index.ts';
import { createInitialState, type GameState } from '../../../src/core/state.ts';
import { createStore } from '../../../src/core/store.ts';
import { ReturnModal } from '../../../src/ui/components/ReturnModal.tsx';
import { GameProvider } from '../../../src/ui/hooks/useGame.ts';

const T0 = 1_763_400_000_000;
const HOUR = 3600_000;

function farm(lang: GameState['settings']['lang'] = 'uk', infantry = 0): GameState {
  const s = createInitialState({ seed: 9, now: T0 });
  return {
    ...s,
    village: { ...s.village, levels: { ...s.village.levels, field: 20, garden: 10 } },
    army: { infantry },
    settings: { ...s.settings, lang },
  };
}

function mount(state: GameState, now: number) {
  const store = createStore(state);
  render(
    <GameProvider store={store} now={() => now}>
      <ReturnModal />
    </GameProvider>,
  );
  return store;
}

afterEach(cleanup);

describe('ReturnModal (M1-18)', () => {
  it('shows nothing without a report', () => {
    mount(farm(), T0);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('2 hours away: the time with plurals, the ducats from the report; «Забрати» credits them and closes', () => {
    const back = applyOffline(farm(), T0 + 2 * HOUR + 5 * 60_000).state;
    const report = back.returnReport;
    if (!report) throw new Error('no report');
    const store = mount(back, T0 + 2 * HOUR + 5 * 60_000);
    const dialog = screen.getByRole('dialog', { name: 'З поверненням!' });
    expect(dialog.textContent).toContain('Час відсутності: 2 години 5 хвилин');
    expect(dialog.textContent).not.toContain('ліміт');
    // 20 fields + 10 gardens (both at tier 10: ×2) for 7500 s (M2-27: 12/s + 48/s = 450 тис.): the window prints the
    // report's own number.
    const prodOf = (id: string): number => KHORTYTSIA.buildings.find((b) => b.id === id)?.baseProd ?? NaN;
    const rate = 20 * prodOf('field') * 2 + 10 * prodOf('garden') * 2;
    expect(report.ducats.toNumber()).toBeCloseTo(rate * 7500, 6);
    expect(dialog.textContent).toContain(`Дукати+${formatBig(report.ducats, 'uk', 'words')}`);
    expect(dialog.textContent).toContain('+450 тис.');
    const before = store.getState().currencies.ducats;
    fireEvent.click(screen.getByRole('button', { name: 'Забрати' }));
    expect(store.getState().currencies.ducats.eq(before.add(report.ducats))).toBe(true);
    expect(store.getState().returnReport).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('over the limit: says only 8 hours were counted; glory shows when there is some', () => {
    const now = T0 + 11 * HOUR;
    const back = applyOffline(farm('uk', 1), now).state;
    mount(back, now);
    const text = screen.getByRole('dialog').textContent;
    expect(text).toContain('Час відсутності: 11 годин');
    expect(text).toContain(`Зараховано: ${String(OFFLINE.capSec / 3600)} годин (ліміт досягнуто).`);
    expect(text).toContain('Слава');
  });

  it('a clock set back: earns nothing and says why', () => {
    const back = applyOffline(farm(), T0 - HOUR).state;
    mount(back, T0 - HOUR);
    const text = screen.getByRole('dialog').textContent;
    expect(text).toContain('Годинник пристрою перевели назад');
    expect(text).not.toContain('Дукати');
  });

  it('nothing built yet: says so instead of «+0»', () => {
    const empty = createInitialState({ seed: 9, now: T0 });
    mount(applyOffline(empty, T0 + HOUR).state, T0 + HOUR);
    expect(screen.getByRole('dialog').textContent).toContain('нічого не нажито');
  });

  it('English', () => {
    const now = T0 + HOUR;
    mount(applyOffline(farm('en'), now).state, now);
    const dialog = screen.getByRole('dialog', { name: 'Welcome back!' });
    expect(dialog.textContent).toContain('Time away: 1 hour');
    expect(dialog.textContent).not.toMatch(/\p{Script=Cyrillic}/u);
    screen.getByRole('button', { name: 'Collect' });
  });

  it('the window takes the focus (no ring on its button until the keyboard moves there); Tab reaches «Забрати»', () => {
    mount(applyOffline(farm(), T0 + HOUR).state, T0 + HOUR);
    const dialog = screen.getByRole('dialog');
    expect(document.activeElement).toBe(dialog);
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Забрати' }));
  });
});

describe('ReturnModal: the raids line (M3-12, §0.1 П8)', () => {
  const MIN = 60_000;
  const roll = (region: 'porohy' | 'tavan' | 'samara', startedAt: number, tier: 'm30' | 'h4' = 'm30') => ({
    region,
    tier,
    startedAt,
    returnAt: startedAt + (tier === 'm30' ? 30 : 240) * MIN,
    success: true,
    rumor: false,
    loot: { ducats: Big.from(100), glory: Big.from(10), pysanky: 0, relic: null },
  });
  const withRaids = (slots: GameState['raids']['slots'], lang: GameState['settings']['lang'] = 'uk'): GameState => {
    const s = farm(lang, 30);
    return { ...s, raids: { ...s.raids, slots }, stats: { ...s.stats, raidsSent: 3 } };
  };

  it('what came back while away waits on «Січ»: the count with plurals and the regions; one still away says when', () => {
    const idle = { kind: 'idle' } as const;
    const s = withRaids([
      { kind: 'running', raid: roll('porohy', T0) },
      { kind: 'running', raid: roll('tavan', T0) },
      idle,
    ]);
    const now = T0 + HOUR;
    mount(applyOffline(s, now).state, now);
    expect(screen.getByRole('dialog').textContent).toContain(
      'Походи: 2 повернулися (Пороги, Тавань) — скрині чекають на Січі',
    );
    cleanup();
    const one = withRaids([
      { kind: 'running', raid: roll('samara', T0) },
      { kind: 'running', raid: roll('porohy', T0, 'h4') },
      idle,
    ]);
    mount(applyOffline(one, now).state, now);
    const text = screen.getByRole('dialog').textContent;
    expect(text).toContain('Походи: 1 повернувся (Самара) — скриня чекає на Січі');
    expect(text).toMatch(/Ще в дорозі: 1 загін\. Повернуться о \d\d:\d\d/u);
  });

  it('no raid back or away: no line; English plurals', () => {
    mount(applyOffline(farm(), T0 + HOUR).state, T0 + HOUR);
    expect(screen.getByRole('dialog').textContent).not.toContain('Походи');
    cleanup();
    const s = withRaids(
      [{ kind: 'running', raid: roll('porohy', T0) }, { kind: 'running', raid: roll('samara', T0) }, { kind: 'idle' }],
      'en',
    );
    mount(applyOffline(s, T0 + HOUR).state, T0 + HOUR);
    expect(screen.getByRole('dialog').textContent).toContain('Raids: 2 came back (');
    expect(screen.getByRole('dialog').textContent).toContain('the chests wait at the Sich');
  });
});
