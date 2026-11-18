// Captures a save fixture from a real game (rules/save.md: «every version has a fixture captured from a real game
// state»): the balance bot plays the real core for `--days` days with `--seed`, and its final state is written exactly
// as the game writes a save (`encodeSave`). Fixtures are immutable once committed — capture a new file per version.
//   node tools/capture-save.ts --seed 7 --days 3 --out tests/fixtures/saves/v1.json
import { existsSync, writeFileSync } from 'node:fs';
import { encodeSave } from '../src/core/save/serialize.ts';
import { simulate } from './lib/balance/sim.ts';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const seed = Number(arg('--seed') ?? 7);
const days = Number(arg('--days') ?? 3);
const out = arg('--out');
if (!out || !Number.isInteger(seed) || !Number.isInteger(days) || days < 1) {
  console.error('usage: node tools/capture-save.ts --seed N --days N --out tests/fixtures/saves/vN.json');
  process.exit(2);
}
if (existsSync(out)) {
  console.error(`${out} exists: fixtures are immutable — add a new version instead`);
  process.exit(1);
}
const { final } = simulate({ seed, days });
// The saver numbers its writes; a played game has written many — any positive count will do.
const seq = 1;
writeFileSync(out, `${encodeSave(final, seq)}\n`);
console.log(`wrote ${out}: seed ${String(seed)}, ${String(days)} days, field ${String(final.village.levels.field)}`);
