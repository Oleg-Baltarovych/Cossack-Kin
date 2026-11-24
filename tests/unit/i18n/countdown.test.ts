// Raid timers for people (plan M3-09, §0.1 П10): the slot card's countdown in two units with seconds only in the last
// minute, and the absolute «повернуться о 21:40» / «завтра о 06:10» on the device's clock (Intl, UI only).
import { describe, expect, it } from 'vitest';
import { dayAt } from '../../../src/core/systems/quests.ts';
import { formatCountdown, formatReturnAt } from '../../../src/i18n/index.ts';

const MIN = 60;
const HOUR = 3600;

describe('formatCountdown (M3-09)', () => {
  it('the last minute in seconds, with plurals (1…60)', () => {
    expect(formatCountdown('uk', 1)).toBe('1 секунда');
    expect(formatCountdown('uk', 3)).toBe('3 секунди');
    expect(formatCountdown('uk', 45)).toBe('45 секунд');
    expect(formatCountdown('uk', 60)).toBe('60 секунд');
    expect(formatCountdown('en', 1)).toBe('1 second');
    expect(formatCountdown('en', 59)).toBe('59 seconds');
  });

  it('past a minute: no seconds, minutes rounded up — «1 хвилина» never stands for 1:59', () => {
    expect(formatCountdown('uk', 61)).toBe('2 хвилини');
    expect(formatCountdown('uk', 2 * MIN)).toBe('2 хвилини');
    expect(formatCountdown('uk', 25 * MIN - 30)).toBe('25 хвилин');
    expect(formatCountdown('en', 5 * MIN)).toBe('5 minutes');
  });

  it('two units past an hour, whole hours alone', () => {
    expect(formatCountdown('uk', HOUR)).toBe('1 година');
    expect(formatCountdown('uk', HOUR + 1)).toBe('1 година 1 хвилина');
    expect(formatCountdown('uk', 3 * HOUR + 20 * MIN + 30)).toBe('3 години 21 хвилина');
    expect(formatCountdown('uk', 8 * HOUR)).toBe('8 годин');
    expect(formatCountdown('en', 4 * HOUR - 1)).toBe('4 hours');
    expect(formatCountdown('en', 2 * HOUR + 59 * MIN + 1)).toBe('3 hours');
  });
});

describe('formatReturnAt: the game’s clock and day (M3-09, §0.1 П10)', () => {
  // Everything at a fixed offset (settings.tzOffsetMin), no named zone: the same day the quests and the board count.
  const KYIV_SUMMER = 180;
  const KYIV_WINTER = 120;
  // 2026-06-01 18:40 UTC = 21:40 at +3.
  const at = Date.UTC(2026, 5, 1, 18, 40);
  const H = HOUR * 1000;

  it('today: «Повернуться о 21:40» — 24-hour in uk, at the game’s offset', () => {
    expect(formatReturnAt('uk', at, at - 2 * H, KYIV_SUMMER)).toBe('Повернуться о 21:40');
    expect(formatReturnAt('uk', at, at - 2 * H, 0)).toBe('Повернуться о 18:40');
    expect(formatReturnAt('uk', at, at - 2 * H, KYIV_WINTER)).toBe('Повернуться о 20:40');
  });

  it('after the local midnight: «завтра о 06:10» — the day is dayAt, as questDay counts it', () => {
    const morning = Date.UTC(2026, 5, 2, 3, 10); // 06:10 at +3
    expect(formatReturnAt('uk', morning, at, KYIV_SUMMER)).toBe('Повернуться завтра о 06:10');
    expect(formatReturnAt('en', morning, at, KYIV_SUMMER)).toBe('Back tomorrow at 6:10 AM');
    expect(dayAt(morning, KYIV_SUMMER) - dayAt(at, KYIV_SUMMER)).toBe(1);
  });

  it('the offset decides the day: the same instants are «today» at UTC and «tomorrow» at +3', () => {
    const now = Date.UTC(2026, 5, 1, 20, 30); // 23:30 at +3
    const back = Date.UTC(2026, 5, 1, 22, 0); // 01:00 at +3, still 22:00 at UTC
    expect(formatReturnAt('uk', back, now, 0)).toBe('Повернуться о 22:00');
    expect(formatReturnAt('uk', back, now, KYIV_SUMMER)).toBe('Повернуться завтра о 01:00');
  });

  it('a 23-hour stretch (the night the clocks go back an hour): today until midnight, tomorrow past it', () => {
    // 00:30 local at +3; the offset turns to +2 overnight — the game keeps the offset it has until the setting moves.
    const now = Date.UTC(2026, 9, 24, 21, 30);
    expect(formatReturnAt('uk', now + 23 * H, now, KYIV_SUMMER)).toBe('Повернуться о 23:30');
    expect(formatReturnAt('uk', now + 23 * H + 31 * 60_000, now, KYIV_SUMMER)).toBe('Повернуться завтра о 00:01');
    // At +2 the same instants read an hour earlier — and `now` (23:30 the day before) makes it «завтра».
    expect(formatReturnAt('uk', now + 23 * H, now, KYIV_WINTER)).toBe('Повернуться завтра о 22:30');
  });

  it('a return already past (`now` after `returnAt`) reads as today, never «вчора» or a date', () => {
    expect(formatReturnAt('uk', at, at + 5 * 60_000, KYIV_SUMMER)).toBe('Повернуться о 21:40');
    expect(formatReturnAt('uk', at, at + 26 * H, KYIV_SUMMER)).toBe('Повернуться о 21:40');
  });

  it('uk «об» before 11 o’clock («об одинадцятій»)', () => {
    const eleven = Date.UTC(2026, 5, 1, 8, 5); // 11:05 at +3
    expect(formatReturnAt('uk', eleven, eleven - 60_000, KYIV_SUMMER)).toBe('Повернуться об 11:05');
    expect(formatReturnAt('uk', eleven + 24 * H, eleven, KYIV_SUMMER)).toBe('Повернуться завтра об 11:05');
    expect(formatReturnAt('uk', eleven, eleven - 60_000, 0)).toBe('Повернуться о 08:05');
  });

  it('en: the 12-hour clock with a no-break space before AM/PM (the pixel font has no narrow one)', () => {
    expect(formatReturnAt('en', at, at - 60_000, KYIV_SUMMER)).toBe('Back at 9:40 PM');
  });

  it('further than tomorrow (a clock set back): the date as well, never a wrong «завтра»', () => {
    expect(formatReturnAt('uk', at + 3 * 24 * H, at, KYIV_SUMMER)).toMatch(/^Повернуться 4 черв\S* о 21:40$/);
  });
});
