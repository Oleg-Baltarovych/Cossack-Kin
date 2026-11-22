// Juice tuning (plan M2-26, SPEC §6.7): distances are whole logical px (the pixel grid), timings fit together.
import { describe, expect, it } from 'vitest';
import { BUTTON, COIN_FLIGHT, COUNTER, SHAKE } from '../../../src/content/juice.ts';

describe('juice content (M2-26)', () => {
  it('every distance is a whole number of logical px; the shake and the press are 2 px (SPEC §6.7)', () => {
    for (const px of [BUTTON.pressPx, BUTTON.hopPx, SHAKE.px, COIN_FLIGHT.arcPx, COIN_FLIGHT.spreadPx])
      expect(Number.isInteger(px) && px > 0).toBe(true);
    expect(BUTTON.pressPx).toBe(2);
    expect(SHAKE.px).toBe(2);
    // The hop's keyframes step through 1 px on the way: it must rise higher than that.
    expect(BUTTON.hopPx).toBeGreaterThan(1);
  });

  it('timings: the counter rolls 250 ms, the shake has several steps, a flight several frames', () => {
    expect(COUNTER.lerpMs).toBe(250);
    expect(SHAKE.ms / SHAKE.stepMs).toBeGreaterThanOrEqual(2);
    expect(COIN_FLIGHT.flightMs / COIN_FLIGHT.frameMs).toBeGreaterThanOrEqual(10);
    expect(SHAKE.events.length).toBeGreaterThan(0);
  });
});
