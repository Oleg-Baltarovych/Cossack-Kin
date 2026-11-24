// Raid modifiers (plan M3-06, SPEC §3.4, §9.6): the treasury and the relics act only through collectModifiers —
// `lootMult` (treasury lootPerLevel, «Порохівниця»), «Пернач» in `powerMult`, `relicChanceMult` and `raidTimeMult`
// (1 until M4) — and the raid card and roll take them from there, on top of the rumour.
import { describe, expect, it } from 'vitest';
import { BOARD, RAID_TIERS, type RaidTierId } from '../../../src/content/raids.ts';
import { RELIC_DEFS, type RelicId } from '../../../src/content/relics.ts';
import { SICH_BUILDINGS } from '../../../src/content/sich.ts';
import { collectModifiers, steadyModifiers } from '../../../src/core/modifiers.ts';
import { createInitialState, type GameState } from '../../../src/core/state.ts';
import { lootOf, previewRaid, raidBoard, raidPower, rollRaid } from '../../../src/core/systems/raids.ts';

const T0 = 1_763_400_000_000;
const DAY = 86_400_000;

const lootPerLevel = SICH_BUILDINGS.find((b) => b.id === 'treasury')?.effects.lootPerLevel ?? 0;
const share = (id: RelicId): number => RELIC_DEFS.find((r) => r.id === id)?.effect.share ?? 0;

function st(
  o: { treasury?: number; relics?: readonly RelicId[]; infantry?: number; maxSeen?: number } = {},
): GameState {
  const s = createInitialState({ seed: 5, now: T0 });
  const maxSeen = o.maxSeen ?? T0;
  return {
    ...s,
    time: { ...s.time, lastSeen: maxSeen, maxSeen },
    village: {
      ...s.village,
      levels: { ...s.village.levels, field: 30, garden: 12, windmill: 8 },
      sichLevels: { ...s.village.sichLevels, treasury: o.treasury ?? 0 },
    },
    army: { infantry: o.infantry ?? 100 },
    relics: o.relics ?? [],
  };
}

/** A day from T0's whose board puts no rumour on `tier` (so the card is the modifiers alone). */
function plainDay(tier: RaidTierId): number {
  const day0 = Math.floor(T0 / DAY);
  for (let k = 0; k < 400; k++) {
    if (raidBoard(5, day0 + k).every((o) => o.tier !== tier || o.rumor === null)) return T0 + k * DAY;
  }
  throw new Error('no plain day');
}

describe('Modifiers: raid fields (M3-06)', () => {
  it('a new game: lootMult, relicChanceMult and raidTimeMult are 1', () => {
    const m = collectModifiers(st(), T0);
    expect([m.lootMult, m.relicChanceMult, m.raidTimeMult]).toEqual([1, 1, 1]);
  });

  it('the treasury adds lootPerLevel per level to lootMult (content)', () => {
    expect(lootPerLevel).toBeGreaterThan(0);
    for (const level of [1, 10, 25]) {
      expect(collectModifiers(st({ treasury: level }), T0).lootMult).toBeCloseTo(1 + level * lootPerLevel, 12);
    }
  });

  it('«Порохівниця» adds its share to lootMult, «Пернач» its share to powerMult; neither touches the other', () => {
    const none = collectModifiers(st(), T0);
    const flask = collectModifiers(st({ relics: ['porokhivnytsia'] }), T0);
    const mace = collectModifiers(st({ relics: ['pernach'] }), T0);
    expect(flask.lootMult).toBeCloseTo(1 + share('porokhivnytsia'), 12);
    expect(flask.powerMult).toBe(none.powerMult);
    expect(mace.powerMult).toBeCloseTo(none.powerMult + share('pernach'), 12);
    expect(mace.lootMult).toBe(1);
    const both = collectModifiers(st({ treasury: 10, relics: ['pernach', 'porokhivnytsia'] }), T0);
    expect(both.lootMult).toBeCloseTo(1 + 10 * lootPerLevel + share('porokhivnytsia'), 12);
  });

  it('the steady modifiers carry the same raid fields (the raid measures by them)', () => {
    const s = st({ treasury: 7, relics: ['pernach', 'porokhivnytsia'] });
    const a = steadyModifiers(s);
    const b = collectModifiers(s, T0);
    expect([a.lootMult, a.relicChanceMult, a.raidTimeMult, a.powerMult]).toEqual([
      b.lootMult,
      b.relicChanceMult,
      b.raidTimeMult,
      b.powerMult,
    ]);
  });
});

describe('the raid takes its multipliers from collectModifiers (M3-06)', () => {
  it('«Пернач» → raid power +5 %', () => {
    expect(raidPower(st({ relics: ['pernach'] })) / raidPower(st())).toBeCloseTo(1 + share('pernach'), 12);
  });

  it('treasury 10 → the card’s and the roll’s loot +10 × lootPerLevel, success and failure alike', () => {
    for (const tier of ['m5', 'h1', 'h8'] as const) {
      const at = plainDay(tier);
      const s = st({ treasury: 10, maxSeen: at });
      const rich = previewRaid(s, tier);
      expect(rich.rumor).toBeNull();
      // The treasury's defence raises the income too: the same state at lootMult 1 isolates the loot share.
      const plain = lootOf(s, tier, 1);
      const k = 1 + 10 * lootPerLevel;
      for (const side of ['success', 'failure'] as const) {
        expect(rich[side].ducats.div(plain[side].ducats).toNumber(), `${tier} ${side}`).toBeCloseTo(k, 9);
        expect(rich[side].glory.div(plain[side].glory).toNumber(), `${tier} ${side}`).toBeCloseTo(k, 9);
      }
      const roll = rollRaid(st({ treasury: 10, maxSeen: at }), tier, at).roll;
      const shown = roll.success ? rich.success : rich.failure;
      expect(roll.loot.ducats.eq(shown.ducats) && roll.loot.glory.eq(shown.glory), tier).toBe(true);
    }
  });

  it('a loot rumour adds its share on top of the treasury and the relic (+ share to lootMult, 1:1)', () => {
    const loot = BOARD.rumors.filter((r) => r.effect.kind === 'loot');
    const day0 = Math.floor(T0 / DAY);
    let checked = 0;
    for (let k = 0; k < 200 && checked < 3; k++) {
      const at = T0 + k * DAY;
      const offer = raidBoard(5, day0 + k).find((o) => loot.some((r) => r.id === o.rumor));
      if (!offer) continue;
      const rumourShare = loot.find((r) => r.id === offer.rumor)?.effect.share ?? 0;
      const s = st({ treasury: 10, relics: ['porokhivnytsia'], maxSeen: at });
      const pre = previewRaid(s, offer.tier);
      const mult = 1 + 10 * lootPerLevel + share('porokhivnytsia') + rumourShare;
      expect(pre.success.ducats.eq(lootOf(s, offer.tier, mult).success.ducats), offer.tier).toBe(true);
      checked++;
    }
    expect(checked).toBe(3);
  });

  it('raidTimeMult is 1 in M3: a raid lasts exactly its tier (the v4 gate checks returnAt to the ms)', () => {
    for (const t of RAID_TIERS) {
      const roll = rollRaid(st({ infantry: 2000 }), t.id, T0).roll;
      expect(roll.returnAt - roll.startedAt, t.id).toBe(t.durationSec * 1000);
    }
  });
});
