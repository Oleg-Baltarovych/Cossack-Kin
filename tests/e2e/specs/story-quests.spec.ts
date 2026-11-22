// Story beats and quests across a reload (plan M2-24 AC «e2e reload зберігає віхи й квести», SPEC §3.10, §2.5). The page
// boots the committed v3 fixture (a played game) from its save slot, on a clock fixed at the fixture's `lastSeen`, so
// no time passes and every number is exact. Through the UI the player builds the farm up to the church's unlock and
// raises the church (the «Освячення Покрови» beat, with its glory, and its window — M2-25); the chain steps and a chore
// are claimed in the quest strip (the chore's taps go through the dev/test `__CK_GAME__.dispatch`). After the reload the beats and the quests are the saved ones, and the
// beat does not fire again: its glory is not granted twice.
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import type { Action } from '../../../src/core/actions.ts';
import { validateState, type GameState } from '../../../src/core/state.ts';
import type {} from '../../../src/ui/debug/gameDebug.ts';
import { assertNativeFrames, nativeFrames, waitReady } from '../helpers/world.ts';

const URL = '/?time=13:00&seed=7&ui=1';
const FIXTURE = readFileSync('tests/fixtures/saves/v3.json', 'utf8').trim();
const LAST_SEEN = (JSON.parse((JSON.parse(FIXTURE) as { payload: string }).payload) as { time: { lastSeen: number } })
  .time.lastSeen;
const AWAY_MS = 8 * 3600_000;

async function gameState(page: Page): Promise<GameState> {
  const r = validateState(JSON.parse(await page.evaluate(() => window.__CK_GAME__?.state() ?? 'null')));
  if (!r.ok) throw new Error(`page state invalid: ${r.error.reason} at ${r.error.path}`);
  return r.state;
}

async function dispatch(page: Page, action: Action): Promise<readonly string[]> {
  return page.evaluate((a) => window.__CK_GAME__?.dispatch(a) ?? [], action);
}

/** Buys `name` in the open tab until it reaches `level` (×10 while ten or more are missing, then ×1). */
async function buyTo(page: Page, name: RegExp, level: () => Promise<number>, target: number): Promise<void> {
  for (let now = await level(); now < target; now = await level()) {
    await page.getByRole('button', { name: target - now >= 10 ? '×10' : '×1', exact: true }).click();
    await page.getByRole('button', { name }).click();
    await expect.poll(level).toBeGreaterThan(now);
  }
}

test.describe('M2-24 story beats and quests across a reload', () => {
  test.skip(({ viewport }) => viewport?.width !== 390, 'runs on the 390×844 project only');

  test('a beat reached and a chain step claimed survive the reload; the beat never fires twice', async ({ page }) => {
    // Eight hours after the fixture was saved: the return window pays the ducats the church's unlock costs.
    await page.clock.setFixedTime(LAST_SEEN + AWAY_MS);
    // The fixed clock fakes the frames too; native ones keep the GPU from falling behind (helper doc, M2-24).
    await nativeFrames(page);
    // The played v3 game in the first slot, once: the reload must load what the page saved, not the fixture again.
    await page.addInitScript((save) => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem('ck.save_a', save);
    }, FIXTURE);
    await page.goto(URL);
    await waitReady(page);
    await assertNativeFrames(page);
    const welcome = page.getByRole('dialog', { name: 'З поверненням!' });
    await welcome.getByRole('button', { name: 'Забрати' }).click();
    await expect(welcome).toBeHidden();
    const start = await gameState(page);
    expect(start.story.seen).not.toContain('khortytsia.pokrova');
    // The sheet fully open: the rows below the half sheet are in reach (a click there never settled, M2-24).
    await page.getByRole('button', { name: /панель/i }).click();

    // The church opens once every farm building is at 25: the tavern and the fair are below it in the fixture.
    const farm = (id: 'field' | 'tavern' | 'fair') => async () => (await gameState(page)).village.levels[id];
    await buyTo(page, /«Шинок»/, farm('tavern'), 25);
    await buyTo(page, /«Ярмарок»/, farm('fair'), 25);
    // The fixture's host is at the food limit: ten more field levels feed one more Cossack (the hire below).
    await buyTo(page, /«Пшеничне поле»/, farm('field'), start.village.levels.field + 10);
    await page.getByRole('tab', { name: 'Січ' }).click();
    await page.getByRole('button', { name: '×1', exact: true }).click();
    const gloryBefore = (await gameState(page)).currencies.glory;
    const church = page.getByRole('button', { name: /«Церква Покрови»/ });
    await expect(church, 'the church is unlocked (every farm building at 25) before the click').toBeEnabled();
    await church.click();
    await expect.poll(async () => (await gameState(page)).village.sichLevels.church).toBe(1);

    const reached = await gameState(page);
    expect(reached.story.seen).toEqual([...start.story.seen, 'khortytsia.pokrova']);
    // The beat's reward came once (the church itself costs ducats, not glory).
    expect(reached.currencies.glory.gt(gloryBefore)).toBe(true);
    // Its window (M2-25) tells of it and holds the focus; Esc closes it and gives the focus back to the church button.
    const pokrova = page.getByRole('dialog', { name: 'Освячення Покрови' });
    await expect(pokrova).toContainText(/Нагорода\+\d+ слави/);
    await expect(pokrova.getByRole('button', { name: 'Гаразд' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(pokrova).toBeHidden();
    await expect(church).toBeFocused();

    // Claim every finished chain step (the fixture stands on «hire one more»: hire, then claim).
    const hire = page.getByRole('button', { name: /^Найняти/ });
    await expect(hire, 'exactly one hire button on the Sich tab').toHaveCount(1);
    await hire.click();
    await expect.poll(async () => (await gameState(page)).stats.hires).toBe(reached.stats.hires + 1);
    // The quest strip at the top of the sheet (M2-25): «Забрати» on the chain line while its step is done.
    // One line over the list: a finished chain step first, then a finished chore.
    const strip = page.getByRole('region', { name: 'Завдання' });
    const chainClaim = strip.locator('[data-quest="chain"]').getByRole('button', { name: /^Забрати/ });
    const chainIndex = async () => {
      const c = (await gameState(page)).quests.chain;
      return c.kind === 'listed' ? c.index : Infinity;
    };
    let claimed = 0;
    // Bounded: a chain step that could be claimed forever would hang here instead of failing.
    for (; claimed < 20 && (await chainClaim.count()) > 0; claimed++) {
      const at = await chainIndex();
      await chainClaim.click();
      await expect.poll(chainIndex).toBeGreaterThan(at);
    }
    expect(claimed, 'the chain stops at a goal not yet met').toBeLessThan(20);
    expect(claimed).toBeGreaterThan(0);
    // The chore of the day (the fixture's is «tap 50 times»): tap until its «Забрати» shows, then claim it there. Taps
    // are capped per second, so the fixed clock steps one second whenever a tap is refused.
    const chore = await gameState(page);
    const choreClaim = strip.locator('[data-quest="chore"]').getByRole('button', { name: /^Забрати/ });
    let clock = LAST_SEEN + AWAY_MS;
    for (let i = 0; i < 400 && (await choreClaim.count()) === 0; i++) {
      if ((await dispatch(page, { type: 'tap' })).includes('Tapped')) continue;
      clock += 1000;
      await page.clock.setFixedTime(clock);
    }
    await choreClaim.click();
    await expect.poll(async () => (await gameState(page)).quests.chores.n).toBe(chore.quests.chores.n + 1);
    const before = await gameState(page);
    expect(before.quests.chain.kind === 'listed' && before.quests.chain.index).toBeGreaterThan(
      start.quests.chain.kind === 'listed' ? start.quests.chain.index : Infinity,
    );
    // One more chore done in the game, and the first reward of this (new) day taken.
    expect(before.quests.chores.n).toBe(chore.quests.chores.n + 1);
    expect(before.quests.chores.claims).toBe(1);
    expect(before.quests.chores.active).not.toBe(chore.quests.chores.active);

    // Hiding the page saves it and stops the loop (lifecycle onPause): that save is what the reload loads.
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.reload();
    await waitReady(page);
    await assertNativeFrames(page);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    const after = await gameState(page);
    expect(after.story).toEqual(before.story);
    expect(after.quests).toEqual(before.quests);
    expect(after.stats).toEqual(before.stats);
    // No time passed and no beat fired again: not a grain of glory more than was saved.
    expect(after.currencies.glory.eq(before.currencies.glory)).toBe(true);
    expect(after.currencies.ducats.eq(before.currencies.ducats)).toBe(true);
    // The claimed steps stay claimed: claiming again gives nothing until the next goal is met.
    expect(await dispatch(page, { type: 'claimQuest', kind: 'chain' })).not.toContain('QuestClaimed');
    // One real action on the loaded game: a field level, paid in ducats (never glory). Every accepted action is
    // followed by the story check, which must find nothing new. (Not a tap: this second's taps went on the chore.)
    const bought = await dispatch(page, { type: 'buyBuilding', id: 'field', mode: 1 });
    expect(bought, 'the field level is bought').toContain('BuildingUpgraded');
    expect(bought).not.toContain('StoryBeatReached');
    const acted = await gameState(page);
    expect(acted.village.levels.field).toBe(before.village.levels.field + 1);
    expect(acted.story.seen).toEqual(before.story.seen);
    expect(acted.currencies.glory.eq(before.currencies.glory)).toBe(true);
  });
});
