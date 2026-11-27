// The sim's stand-in for the first culture rank (plan M4-04, coordinator decision (a) as for `raid1` in M3-04): until
// the bot's culture policy (M4-09), the bot learns one rank of «Кобзарські думи» on the chain step `culture1` — and
// only there — through the real `buyCulture` action (M4-05), paying its content price in glory.
import { describe, expect, it } from 'vitest';
import { CULTURE_NODES } from '../../../src/content/culture.ts';
import { CHAIN_STEP_IDS, type ChainStepId } from '../../../src/content/quests.ts';
import { Big } from '../../../src/core/big.ts';
import { steadyModifiers } from '../../../src/core/modifiers.ts';
import { decodeSave, encodeSave } from '../../../src/core/save/serialize.ts';
import { createInitialState, type GameState } from '../../../src/core/state.ts';
import { chainQuest } from '../../../src/core/systems/quests.ts';
import { simulate, standInCulture } from '../../../tools/lib/balance/sim.ts';

const T0 = 1_763_400_000_000;
const dumy = CULTURE_NODES.find((n) => n.id === 'music.dumy');

/** On chain step `id` (counted from now), the tavern at `tavern`, `glory` in the purse. */
function onStep(id: ChainStepId, { tavern = 1, glory = 1e6 }: { tavern?: number; glory?: number } = {}): GameState {
  const s = createInitialState({ seed: 3, now: T0 });
  return {
    ...s,
    currencies: { ...s.currencies, glory: Big.from(glory) },
    village: { ...s.village, levels: { ...s.village.levels, tavern } },
    quests: { ...s.quests, chain: { kind: 'listed', index: CHAIN_STEP_IDS.indexOf(id), base: 0 } },
  };
}

/** The first rank's price: base × growth^0 × cultureCostMult (plan §0), read from content and the modifiers. */
const firstPrice = (s: GameState): Big => Big.from(dumy?.base ?? Number.NaN).mul(steadyModifiers(s).cultureCostMult);

describe('standInCulture (M4-04 stand-in, the real action since M4-05; M4-09 replaces it)', () => {
  it('on `culture1`: one rank of «Кобзарські думи», cultureRanks + 1, its price paid in glory; the step is done', () => {
    const s = onStep('khortytsia.culture1');
    const after = standInCulture(s);
    if (!after) throw new Error('no stand-in');
    expect(after.culture).toEqual({ 'music.dumy': 1 });
    expect(after.stats.cultureRanks).toBe(s.stats.cultureRanks + 1);
    expect(after.currencies.glory.toNumber()).toBeCloseTo(s.currencies.glory.sub(firstPrice(s)).toNumber(), 6);
    expect(chainQuest(after)?.done).toBe(true);
    // What it stores passes the v5 gate, as the action's state will.
    const back = decodeSave(encodeSave(after));
    expect(back.ok && back.state.culture).toEqual({ 'music.dumy': 1 });
  });

  it('only on that step: any other step, a locked «Музика» (no tavern) or too little glory → nothing', () => {
    expect(standInCulture(onStep('khortytsia.tavern1'))).toBeNull();
    expect(standInCulture(onStep('khortytsia.treasury1'))).toBeNull();
    expect(standInCulture(onStep('khortytsia.culture1', { tavern: 0 }))).toBeNull();
    const short = onStep('khortytsia.culture1', { glory: 0 });
    expect(
      standInCulture({ ...short, currencies: { ...short.currencies, glory: firstPrice(short).mul(0.99) } }),
    ).toBeNull();
  });

  it('once: with the step done (or the root learnt before) it does not buy again', () => {
    const once = standInCulture(onStep('khortytsia.culture1'));
    if (!once) throw new Error('no stand-in');
    expect(standInCulture(once)).toBeNull();
  });

  it('the bot gets past `culture1`: the chain runs on to the steps after it', () => {
    const r = simulate({ seed: 1, days: 4 });
    const steps = r.novelties.filter((n) => n.kind === 'chainStep').map((n) => n.ref);
    expect(steps).toContain('khortytsia.culture1');
    expect(steps).toContain('khortytsia.treasury1');
    expect(r.final.culture['music.dumy']).toBe(1);
  });
});
