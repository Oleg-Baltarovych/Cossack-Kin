// Captures a save fixture from a real game (rules/save.md: «every version has a fixture captured from a real game
// state»): the balance bot plays the real core for `--days` days with `--seed`, and its final state is written exactly
// as the game writes a save (`encodeSave`). Fixtures are immutable once committed — capture a new file per version.
// v4 (M3-04; M3-05: through the real `startRaid`): until the bot raids (M3-08) the sim sends only the onboarding raid
// of `raid1` (returned by the end — `advance` turns it), and the capture sends a 1-h raid at the end (on its way).
// `v4.json` is committed and immutable: this path is for the next version's fixture.
//   node tools/capture-save.ts --seed 7 --days 3 --out tests/fixtures/saves/v4.json
import { existsSync, writeFileSync } from 'node:fs';
import { applyAction } from '../src/core/actions.ts';
import { encodeSave } from '../src/core/save/serialize.ts';
import type { GameState } from '../src/core/state.ts';
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
const played = simulate({ seed, days }).final;
// The bot claims finished quests as it plays (M2-27); this last sweep — every chain step and the chore, through the
// real action — stays so a fixture never ends on a finished, unclaimed quest (v3+).
function claimAll(start: GameState): GameState {
  let s = start;
  for (const kind of ['chain', 'chore'] as const) {
    for (;;) {
      const r = applyAction(s, { type: 'claimQuest', kind }, s.time.lastSeen);
      if (r.state === s) break;
      s = r.state;
    }
  }
  return s;
}
// M3-08 replaces this with the bot's real raids: a 1-h raid sent at the end of play (on its way) through the action.
const end = played.time.lastSeen;
const slot = played.raids.slots.findIndex((x) => x.kind === 'idle');
const r = applyAction(played, { type: 'startRaid', slot, tier: 'h1' }, end);
if (r.events.some((e) => e.type === 'ActionRejected')) throw new Error('capture: the 1-h raid cannot start at the end');
const sent = r.state;
const final = claimAll(sent);
// The saver numbers its writes; a played game has written many — any positive count will do.
const seq = 1;
writeFileSync(out, `${encodeSave(final, seq)}\n`);
console.log(
  `wrote ${out}: seed ${String(seed)}, ${String(days)} days, field ${String(final.village.levels.field)}, raids ${final.raids.slots.map((x) => x.kind).join('/')}`,
);
