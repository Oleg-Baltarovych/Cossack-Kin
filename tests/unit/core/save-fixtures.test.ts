// Every committed save fixture (tests/fixtures/saves/vN.json, immutable — rules/save.md) must still load: decode →
// migration chain → validateState, through the same path the game takes on boot.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { chooseSave } from '../../../src/core/save/load.ts';
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

  it('v1 is a real played game: buildings, Sich and Cossacks, and re-encodes to the same payload', () => {
    const raw = readFileSync(join(DIR, 'v1.json'), 'utf8').trim();
    const r = decodeSave(raw);
    if (!r.ok) throw new Error(r.reason);
    expect(Object.values(r.state.village.levels).every((l) => l > 0)).toBe(true);
    expect(r.state.army.infantry).toBeGreaterThan(0);
    expect(Object.values(r.state.village.sichLevels).some((l) => l > 0)).toBe(true);
    expect(encodeSave(r.state, r.seq)).toBe(raw);
  });
});
