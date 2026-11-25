// Raids end to end (plan M3-17, SPEC §3.4, §3.8, plan §0.1 П7/П12): a raid's roll is made at the start and survives
// reloads; the squad comes back on the (fake) clock and «Забрати» grants exactly the card's loot; an absence longer than
// the raid brings it home — a clock set back does not; «Ще раз» sends the same tier in one tap; the change of the game's
// day (UTC midnight) leaves a raid on the road alone; «менше руху» opens the chest on its finished list.
// Every test boots a save built here with the core (the page loads the save, never a `?state=` preset: a preset is not
// saved, and these tests reload). The clock is Playwright's fixed clock (`setFixedTime`, stepped by the test) with native,
// GPU-paced frames (the `test` fixture, helpers/test.ts); the zone is UTC like CI, so the new game's zone matches the save's.
// Raid lengths come from the content (`raidTier`), never as literals.
import type { Page } from '@playwright/test';
import { expect, test } from '../helpers/test.ts';
import { advance } from '../../../src/core/advance.ts';
import { applyAction } from '../../../src/core/actions.ts';
import type { Big } from '../../../src/core/big.ts';
import { encodeSave } from '../../../src/core/save/serialize.ts';
import { createInitialState, validateState, type GameState } from '../../../src/core/state.ts';
import { raidTier } from '../../../src/core/systems/raids.ts';
import { dueBeats } from '../../../src/core/systems/story.ts';
import type { RaidRoll } from '../../../src/core/systems/raids.ts';
import type { RaidTierId } from '../../../src/content/raids.ts';
import type {} from '../../../src/ui/debug/gameDebug.ts';
import { waitReady } from '../helpers/world.ts';

test.use({ timezoneId: 'UTC' });

const SEED = 7;
const T0 = Date.UTC(2026, 5, 1, 10, 0, 0);
const HOUR_MS = 3600_000;
/** One second after a save's `lastSeen`: short of the return window, long enough for the loop to tick. */
const SETTLE_MS = 1000;
/** Cossacks of the two armies: 12 = 60 % on a 30-min raid (a roll that can fail), 1000 reaches every tier. */
const SMALL = 12;
const BIG = 1000;
/** The uk names of the tiers on the raid map's flags (the locale JSON cannot load in Node). */
const TIER_NAME: Readonly<Record<RaidTierId, string>> = {
  m5: 'Розвідка',
  m30: 'Дозор',
  h1: 'Застава',
  h4: 'Похід',
  h8: 'Далекий похід',
};
const durationMs = (id: RaidTierId): number => raidTier(id).durationSec * 1000;

// --- a save built with the core ---------------------------------------------------------------------------------

/** A new game at `T0` with `infantry` Cossacks hired and every story beat they reach already seen (no window on the way). */
function baseState(infantry: number): GameState {
  const s = createInitialState({ seed: SEED, now: T0 });
  const grown: GameState = { ...s, army: { infantry }, stats: { ...s.stats, hires: infantry } };
  const due = dueBeats(grown, s.story.seen).map((b) => b.id);
  return { ...grown, story: { seen: [...s.story.seen, ...due] } };
}

/** `baseState` with squad 1 sent on `tier` at `at`. */
function sent(infantry: number, tier: RaidTierId, at = T0): GameState {
  const r = applyAction(baseState(infantry), { type: 'startRaid', slot: 0, tier }, at);
  if (!r.events.some((e) => e.type === 'RaidStarted'))
    throw new Error(`the raid did not start: ${JSON.stringify(r.events)}`);
  return r.state;
}

function raidOf(s: GameState, slot = 0): { kind: 'idle' } | { kind: 'running' | 'returned'; raid: RaidRoll } {
  const x = s.raids.slots[slot];
  if (!x) throw new Error(`no slot ${String(slot)}`);
  return x;
}

function runningRaid(s: GameState, slot = 0): RaidRoll {
  const x = raidOf(s, slot);
  if (x.kind !== 'running') throw new Error(`slot ${String(slot)} is ${x.kind}, not running`);
  return x.raid;
}

// --- the page --------------------------------------------------------------------------------------------------

async function gameState(page: Page): Promise<GameState> {
  const r = validateState(JSON.parse(await page.evaluate(() => window.__CK_GAME__?.state() ?? 'null')));
  if (!r.ok) throw new Error(`page state invalid: ${r.error.reason} at ${r.error.path}`);
  return r.state;
}

/** Boots `state` as the save of the first slot, once (a reload loads what the page saved), on a clock fixed at `now`. */
async function openGame(page: Page, state: GameState, now: number, query = ''): Promise<void> {
  await page.clock.setFixedTime(now);
  await page.addInitScript(
    (save) => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem('ck.save_a', save);
    },
    encodeSave(state, 1),
  );
  await page.goto(`/?seed=${String(SEED)}&time=13:00&ui=1${query}`);
  await waitReady(page);
}

async function setVisibility(page: Page, state: 'visible' | 'hidden'): Promise<void> {
  await page.evaluate((v) => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => v });
    document.dispatchEvent(new Event('visibilitychange'));
  }, state);
}

/** The player leaves (the page saves), the clock stands at `to` when they come back (the return tick reads it). */
async function awayUntil(page: Page, to: number): Promise<void> {
  await setVisibility(page, 'hidden');
  await page.clock.setFixedTime(to);
  await setVisibility(page, 'visible');
}

const returnWindow = (page: Page) => page.getByRole('dialog', { name: 'З поверненням!' });

async function closeReturnWindow(page: Page): Promise<void> {
  const back = returnWindow(page);
  await back.getByRole('button', { name: 'Забрати' }).click();
  await expect(back).toBeHidden();
}

const norm = (text: string): string => text.replace(/\s+/g, ' ').trim();

const sichBlock = (page: Page) => page.getByRole('region', { name: 'Походи' });

async function openSich(page: Page): Promise<void> {
  await page.getByRole('tab', { name: 'Січ' }).click();
  await expect(sichBlock(page)).toBeVisible();
}

/** Squad 1 sent through the map: its card's loot lines are returned (what the player was shown before the start). */
async function sendFromMap(page: Page, tier: RaidTierId): Promise<{ success: string; failure: string }> {
  await openSich(page);
  await page.getByRole('button', { name: 'Загін 1: обрати похід' }).click();
  const map = page.getByRole('dialog', { name: /^Мапа походів/ });
  await expect(map).toBeVisible();
  await map
    .getByRole('group', { name: 'Походи дня' })
    .getByRole('button', { name: new RegExp(`^${TIER_NAME[tier]}, `) })
    .click();
  const card = map.getByRole('region', { name: new RegExp(`^${TIER_NAME[tier]} — `) });
  const success = norm(await card.locator('[data-fact="success"] dd').innerText());
  const failure = norm(await card.locator('[data-fact="failure"] dd').innerText());
  await card.getByRole('button', { name: /^Вирушити: .*, загін 1$/ }).click();
  await expect(map).toBeHidden();
  return { success, failure };
}

/** Closes the chest window a claim opened, once it shows everything. */
async function closeChest(page: Page): Promise<string> {
  const chest = page.getByRole('dialog', { name: 'Здобич походу' });
  await expect(chest).toBeVisible();
  await chest.getByRole('heading').click();
  await expect(chest).toHaveAttribute('data-reveal', 'done');
  const items = norm((await chest.getByRole('listitem').allInnerTexts()).map(norm).join(', '));
  await chest.getByRole('button', { name: 'Забрати' }).click();
  await expect(chest).toBeHidden();
  return items;
}

/** Equal within a relative tolerance (the core's amounts are `Big`). */
function expectClose(actual: Big, expected: Big): void {
  const a = actual.toNumber();
  const e = expected.toNumber();
  expect(Math.abs(a - e)).toBeLessThanOrEqual(1e-9 * Math.max(Math.abs(a), Math.abs(e), 1));
}

// --- the tests -------------------------------------------------------------------------------------------------

test.describe('M3-17 raids end to end', () => {
  test('a raid started through the map keeps its roll across three reloads', async ({ page }) => {
    await openGame(page, baseState(SMALL), T0 + SETTLE_MS);
    await sendFromMap(page, 'm30');
    const started = runningRaid(await gameState(page));
    expect(started.tier).toBe('m30');
    expect(started.returnAt - started.startedAt).toBe(durationMs('m30'));
    // The start saved at once (M3-16): no hiding the page, the reload loads that save.
    for (let i = 0; i < 3; i++) {
      await page.reload();
      await waitReady(page);
      await expect(page.getByRole('dialog')).toHaveCount(0);
      const after = runningRaid(await gameState(page));
      expect(after.success).toBe(started.success);
      expect(JSON.stringify(after.loot)).toBe(JSON.stringify(started.loot));
      expect(after).toEqual(started);
      await openSich(page);
      await expect(sichBlock(page).getByRole('progressbar')).toHaveCount(1);
    }
  });

  test('the squad comes back on the clock; «Забрати» grants what the card showed', async ({ page }) => {
    await openGame(page, baseState(SMALL), T0 + SETTLE_MS);
    const card = await sendFromMap(page, 'm30');
    const roll = runningRaid(await gameState(page));
    // The raid's length and a little more, away: the return window names the squad, the chest waits on «Січ».
    await awayUntil(page, roll.returnAt + 5_000);
    await expect(returnWindow(page).locator('[data-return="raids"]')).toHaveText(
      /^Походи: 1 повернувся \(.+\) — скриня чекає на Січі$/,
    );
    await closeReturnWindow(page);
    expect(raidOf(await gameState(page)).kind).toBe('returned');

    await openSich(page);
    const before = (await gameState(page)).currencies;
    await sichBlock(page).getByRole('button', { name: 'Забрати здобич загону 1' }).click();
    const items = await closeChest(page);
    const after = await gameState(page);
    expect(raidOf(after).kind).toBe('idle');
    // The clock stands: the purse moves by the roll's loot alone.
    expectClose(after.currencies.ducats.sub(before.ducats), roll.loot.ducats);
    expectClose(after.currencies.glory.sub(before.glory), roll.loot.glory);
    expect(after.currencies.pysanky - before.pysanky).toBe(roll.loot.pysanky);
    if (roll.loot.relic !== null) expect(JSON.stringify(after.relics)).toContain(roll.loot.relic);
    // The chest shows the line the card promised for this roll (a failure's smaller loot, never 0).
    expect(items.startsWith(roll.success ? card.success : card.failure)).toBe(true);
  });

  test('away 9 h with an 8-h raid: the return window shows it back', async ({ page }) => {
    const raid = runningRaid(sent(BIG, 'h8'));
    expect(raid.returnAt - raid.startedAt).toBe(durationMs('h8'));
    await openGame(page, sent(BIG, 'h8'), T0 + 9 * HOUR_MS);
    await expect(returnWindow(page).locator('[data-return="raids"]')).toHaveText(
      /^Походи: 1 повернувся \(.+\) — скриня чекає на Січі$/,
    );
    const back = await gameState(page);
    // The income is capped by the offline limit, the raid is not: it came home at its own time.
    expect(back.returnReport?.awaySec).toBe((9 * HOUR_MS) / 1000);
    expect(back.returnReport?.capped).toBe(true);
    expect(raidOf(back).kind).toBe('returned');
    await closeReturnWindow(page);
    await openSich(page);
    await expect(sichBlock(page).getByRole('button', { name: 'Забрати здобич загону 1' })).toBeVisible();
  });

  test('away less than the raid lasts: it is still on the road', async ({ page }) => {
    await openGame(page, sent(BIG, 'h8'), T0 + durationMs('h8') - HOUR_MS);
    await expect(returnWindow(page).locator('[data-return="raidsAway"]')).toHaveText(/^Ще в дорозі: 1 загін\./);
    await expect(returnWindow(page).locator('[data-return="raids"]')).toHaveCount(0);
    expect(raidOf(await gameState(page)).kind).toBe('running');
  });

  test('the clock set back: the squad stays on the road, nothing is lost', async ({ page }) => {
    await openGame(page, sent(SMALL, 'm30'), T0 + SETTLE_MS);
    const roll = runningRaid(await gameState(page));
    const seen = (await gameState(page)).time.lastSeen;
    await awayUntil(page, T0 - 2 * HOUR_MS);
    await expect(returnWindow(page)).toContainText(/годинник/i);
    await expect(returnWindow(page).locator('[data-return="raidsAway"]')).toHaveText(/^Ще в дорозі: 1 загін\./);
    await closeReturnWindow(page);
    const after = await gameState(page);
    expect(runningRaid(after)).toEqual(roll);
    expect(after.time.lastSeen).toBeGreaterThanOrEqual(seen);
    await openSich(page);
    await expect(sichBlock(page).getByRole('progressbar')).toHaveCount(1);
  });

  test('«Ще раз» claims and sends the same tier again with one tap', async ({ page }) => {
    const out = sent(BIG, 'h1');
    const back = advance(out, runningRaid(out).returnAt).state;
    expect(raidOf(back).kind).toBe('returned');
    const now = runningRaid(out).returnAt + SETTLE_MS;
    await openGame(page, back, now);
    const before = await gameState(page);
    await openSich(page);
    await sichBlock(page)
      .getByRole('button', { name: new RegExp(`^Забрати й знову вирушити: ${TIER_NAME.h1}`) })
      .click();
    await closeChest(page);
    const after = await gameState(page);
    const again = runningRaid(after);
    expect(again.tier).toBe('h1');
    expect(again.startedAt).toBeGreaterThanOrEqual(now);
    expect(again.returnAt - again.startedAt).toBe(durationMs('h1'));
    expect(after.stats.raidsDone).toBe(before.stats.raidsDone + 1);
    expect(after.stats.raidsSent).toBe(before.stats.raidsSent + 1);
    // The old loot was granted (the purse grew), the new raid has its own roll.
    expect(after.currencies.ducats.gt(before.currencies.ducats)).toBe(true);
  });

  test('the game day changing at UTC midnight leaves a raid on the road alone', async ({ page }) => {
    const start = Date.UTC(2026, 5, 1, 23, 50, 0);
    const state = sent(BIG, 'h1', start);
    const roll = runningRaid(state);
    // Back at 00:50 the next day: midnight falls in the middle of it.
    await openGame(page, state, start + SETTLE_MS);
    const day = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
    expect(day(roll.returnAt)).not.toBe(day(start));

    await awayUntil(page, Date.UTC(2026, 5, 2, 0, 10, 0));
    await closeReturnWindow(page);
    const midnight = await gameState(page);
    expect(day(midnight.time.lastSeen)).not.toBe(day(start));
    expect(runningRaid(midnight)).toEqual(roll);
    await openSich(page);
    await expect(sichBlock(page).getByRole('progressbar')).toHaveCount(1);

    // It still comes home at its own time with the loot rolled the day before.
    await awayUntil(page, roll.returnAt + 5_000);
    await closeReturnWindow(page);
    const home = raidOf(await gameState(page));
    expect(home.kind).toBe('returned');
    if (home.kind === 'returned') expect(home.raid).toEqual(roll);
  });

  test('«менше руху»: the chest opens straight on its finished list', async ({ page }) => {
    const out = sent(BIG, 'm30');
    const back = advance(out, runningRaid(out).returnAt).state;
    await openGame(page, back, runningRaid(out).returnAt + SETTLE_MS, '&still');
    await openSich(page);
    await sichBlock(page).getByRole('button', { name: 'Забрати здобич загону 1' }).click();
    const chest = page.getByRole('dialog', { name: 'Здобич походу' });
    await expect(chest).toBeVisible();
    // Read at once, not awaited: the shaking chest of the normal motion would be 'shake' here.
    expect(await chest.getAttribute('data-reveal')).toBe('done');
    await expect(chest.locator('[data-phase="shake"]')).toHaveCount(0);
    await expect(chest.getByRole('listitem').first()).toBeVisible();
    await expect(chest.getByRole('button', { name: 'Забрати' })).toBeFocused();
  });
});
