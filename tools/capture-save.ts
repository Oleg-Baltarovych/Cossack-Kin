// Captures a save fixture from a real game (rules/save.md: «every version has a fixture captured from a real game
// state»): the balance bot plays the real core for `--days` days with `--seed`, and its final state is written exactly
// as the game writes a save (`encodeSave`). Fixtures are immutable once committed — capture a new file per version.
// v4 (M3-04): raids come from the sim's stand-in for `startRaid` (`standInRaid`: `canStart` + `rollRaid`) until the bot
// raids (M3-08): the onboarding raid of `raid1` (returned by the end) and a 1-h raid sent at the end (on its way).
//   node tools/capture-save.ts --seed 7 --days 3 --out tests/fixtures/saves/v4.json
import { existsSync, writeFileSync } from 'node:fs';
import { applyAction } from '../src/core/actions.ts';
import { encodeSave } from '../src/core/save/serialize.ts';
import type { GameState } from '../src/core/state.ts';
import type { RaidSlot } from '../src/core/systems/raids.ts';
import { simulate, standInRaid } from './lib/balance/sim.ts';

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
// M3-08 replaces this with the bot's real raids. The sim's stand-in sent the onboarding raid (`raid1`, Q7); until
// M3-05's `advance` turns a raid that is back into `returned`, the capture does that here, then sends a 1-h raid at the
// end of play (on its way). The claim sweep comes last, as for any fixture.
const end = played.time.lastSeen;
const back: GameState = {
  ...played,
  raids: {
    ...played.raids,
    slots: played.raids.slots.map((x): RaidSlot =>
      x.kind === 'running' && x.raid.returnAt <= played.time.maxSeen ? { kind: 'returned', raid: x.raid } : x,
    ),
  },
};
const sent = standInRaid(
  back,
  back.raids.slots.findIndex((x) => x.kind === 'idle'),
  'h1',
  end,
);
if (!sent) throw new Error('capture: the 1-h raid cannot start at the end of play');
const final = claimAll(sent);
// The saver numbers its writes; a played game has written many — any positive count will do.
const seq = 1;
writeFileSync(out, `${encodeSave(final, seq)}\n`);
console.log(
  `wrote ${out}: seed ${String(seed)}, ${String(days)} days, field ${String(final.village.levels.field)}, raids ${final.raids.slots.map((x) => x.kind).join('/')}`,
);
