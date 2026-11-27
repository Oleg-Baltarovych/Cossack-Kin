// Every share a modifier breakdown can show is a whole number of `PERCENT_STEP` (plan M4-07, code review): then each
// floored row is exact and the rows add up to the floored total the player reads (culture-selectors.test.ts). A new
// source with a finer share fails here — make its share a multiple, or change the step.
import { describe, expect, it } from 'vitest';
import { CULTURE_NODES } from '../../../src/content/culture.ts';
import { DEFENCE } from '../../../src/content/economy.ts';
import { EFFECT_TARGETS, PERCENT_STEP, type RankedEffect } from '../../../src/content/effects.ts';
import { HEROES } from '../../../src/content/heroes.ts';
import { RELIC_DEFS } from '../../../src/content/relics.ts';
import { SICH_BUILDINGS } from '../../../src/content/sich.ts';
import { KHORTYTSIA } from '../../../src/content/villages/khortytsia.ts';

const PERCENT = 100;
/** Float slack as in `core/percent.ts`. */
const EPS = 1e-9;
const onStep = (share: number): boolean => {
  const steps = (share * PERCENT) / PERCENT_STEP;
  return Math.abs(steps - Math.round(steps)) < EPS;
};
/** Seconds-valued kinds (the caps) are not percents. */
const percentEffects = (effects: readonly RankedEffect[]): readonly RankedEffect[] =>
  effects.filter((e) => {
    const t = EFFECT_TARGETS[e.kind];
    return t.to !== 'field' || (t.field !== 'offlineCapSec' && t.field !== 'gloryCapSec');
  });

describe('breakdown shares are multiples of PERCENT_STEP (M4-07)', () => {
  it('culture ranks and hero levels', () => {
    for (const n of CULTURE_NODES)
      for (const e of percentEffects(n.effects)) expect(onStep(e.perRank), n.id).toBe(true);
    for (const h of HEROES) for (const e of percentEffects(h.effects)) expect(onStep(e.perRank), h.id).toBe(true);
  });

  it('relics, Sich and farm levels, the defence bonus, the land passive', () => {
    for (const r of RELIC_DEFS) expect(onStep(r.effect.share), r.id).toBe(true);
    for (const b of SICH_BUILDINGS) {
      const e = b.effects;
      for (const share of [e.powerPerLevel, e.gloryPerLevel, e.lootPerLevel]) {
        if (share !== undefined) expect(onStep(share), b.id).toBe(true);
      }
      // «Спокій на хуторах»: one level's defence points × the income per point.
      expect(onStep(e.defencePerLevel * DEFENCE.incomePerPoint), b.id).toBe(true);
    }
    for (const b of KHORTYTSIA.buildings) {
      if (b.effect && b.effect.kind !== 'fairDay') expect(onStep(b.effect.perLevel), b.id).toBe(true);
    }
    expect(onStep(KHORTYTSIA.passive.mult - 1)).toBe(true);
  });
});
