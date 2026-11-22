// Every committed save fixture (tests/fixtures/saves/vN.json, immutable — rules/save.md) must still load: decode →
// migration chain → validateState, through the same path the game takes on boot.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { chooseSave } from '../../../src/core/save/load.ts';
import { migrate, MIGRATIONS } from '../../../src/core/save/migrations/index.ts';
import { decodeSave, encodeSave, SAVE_VERSION } from '../../../src/core/save/serialize.ts';
import { validateState } from '../../../src/core/state.ts';

const DIR = 'tests/fixtures/saves';
const fixtures = readdirSync(DIR)
  .filter((f) => /^v\d+\.json$/.test(f))
  .sort((a, b) => Number(a.slice(1, -5)) - Number(b.slice(1, -5)));

describe('save fixtures (M1-20, rules/save.md)', () => {
  it('there is a fixture for every version up to the current one', () => {
    expect(fixtures.map((f) => Number(f.slice(1, -5)))).toEqual(Array.from({ length: SAVE_VERSION }, (_, i) => i + 1));
  });

  for (const file of fixtures) {
    it(`${file} loads through the full chain and passes validateState`, () => {
      const raw = readFileSync(join(DIR, file), 'utf8').trim();
      const r = decodeSave(raw);
      if (!r.ok) throw new Error(`${file}: ${r.reason}`);
      expect(validateState(JSON.parse(JSON.stringify(r.state))).ok).toBe(true);
      // The boot picks it from a slot like any save.
      const boot = chooseSave(raw, null);
      expect(boot.kind).toBe('loaded');
    });
  }

  for (const file of ['v1.json', 'v2.json', 'v3.json']) {
    it(`${file} is a real played game: buildings, Sich and Cossacks`, () => {
      const r = decodeSave(readFileSync(join(DIR, file), 'utf8').trim());
      if (!r.ok) throw new Error(r.reason);
      expect(Object.values(r.state.village.levels).every((l) => l > 0)).toBe(true);
      expect(r.state.army.infantry).toBeGreaterThan(0);
      expect(Object.values(r.state.village.sichLevels).some((l) => l > 0)).toBe(true);
    });
  }

  it('the fixture of the current version re-encodes to the same save (nothing lost or added on load)', () => {
    const raw = readFileSync(join(DIR, `v${String(SAVE_VERSION)}.json`), 'utf8').trim();
    const r = decodeSave(raw);
    if (!r.ok) throw new Error(r.reason);
    expect(encodeSave(r.state, r.seq)).toBe(raw);
  });

  it('v2 was played with the story: beats fired in play are seen, and the counters ran', () => {
    const r = decodeSave(readFileSync(join(DIR, 'v2.json'), 'utf8').trim());
    if (!r.ok) throw new Error(r.reason);
    expect(r.state.story.seen).toContain('khortytsia.shore');
    expect(r.state.story.seen).toContain('khortytsia.messenger');
    expect(r.state.stats.levelsBought).toBeGreaterThan(0);
    expect(r.state.stats.hires).toBe(r.state.army.infantry);
    expect(r.state.stats.tapIncomeSec).toBeGreaterThan(0);
  });
});

describe('v3 fixture (M2-23)', () => {
  it('was played with quests: chain steps and a chore claimed, the active ones counted from their start', () => {
    const r = decodeSave(readFileSync(join(DIR, 'v3.json'), 'utf8').trim());
    if (!r.ok) throw new Error(r.reason);
    const q = r.state.quests;
    expect(q.chain.kind === 'listed' && q.chain.index).toBeGreaterThan(0);
    expect(q.chores.n).toBeGreaterThan(0);
    expect(q.chores.claims).toBe(q.chores.n);
    expect(r.state.settings.tzOffsetMin).toBe(0);
  });
});

describe('the registered migration chain (M2-24)', () => {
  const v1 = (): unknown =>
    JSON.parse((JSON.parse(readFileSync(join(DIR, 'v1.json'), 'utf8')) as { payload: string }).payload) as unknown;

  it('has exactly one step per version, from 1 up to the current one, in order', () => {
    expect(MIGRATIONS.map((m) => [m.from, m.to])).toEqual(
      Array.from({ length: SAVE_VERSION - 1 }, (_, i) => [i + 1, i + 2]),
    );
  });

  it('a hole anywhere in it is an error: the oldest fixture is refused, never half-migrated', () => {
    expect(migrate(v1(), 1).ok).toBe(true);
    MIGRATIONS.forEach((_, hole) => {
      const holed = MIGRATIONS.filter((__, i) => i !== hole);
      expect(migrate(v1(), 1, holed), `without step ${String(hole + 1)}`).toEqual({ ok: false });
    });
  });
});
