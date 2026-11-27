// Captures a save fixture from a real game (rules/save.md: «every version has a fixture captured from a real game
// state»): the balance bot plays the real core for `--days` days with `--seed`, and its final state is written exactly
// as the game writes a save (`encodeSave`). Fixtures are immutable once committed — capture a new file per version.
// Raids (M3-08): the bot raids through the real actions, so a played game ends with its slots out (or back,
// unclaimed). `v4.json` was captured before that (M3-04/05: the onboarding raid and a 1-h raid this tool sent at the
// end) and stays as committed — fixtures are immutable; this path is for the next version's fixture.
// v5 (M4-04): the bot's game carries a hero (the otaman of «Рада на майдані»); culture ranks come from the bot's own
// policy (M4-09; `v5.json` was captured with the stand-in before it and stays as committed).
//   node tools/capture-save.ts --seed 7 --days 3 --out tests/fixtures/saves/v5.json
import { existsSync, writeFileSync } from 'node:fs';
import { RAIDS } from '../src/content/raids.ts';
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
const final = claimAll(played);
// A fixture of a raiding game carries raids: the bot keeps every open slot busy at the end of a session.
if (final.raids.slots.slice(0, RAIDS.slots).every((x) => x.kind === 'idle'))
  throw new Error('capture: the played game has no raid out — play more days');
// A v5 fixture carries a hero: the bot's game must have reached «Рада на майдані».
if (Object.keys(final.heroes).length === 0) throw new Error('capture: no hero arrived — play more days');
// The saver numbers its writes; a played game has written many — any positive count will do.
const seq = 1;
writeFileSync(out, `${encodeSave(final, seq)}\n`);
console.log(
  `wrote ${out}: seed ${String(seed)}, ${String(days)} days, field ${String(final.village.levels.field)}, raids ${final.raids.slots.map((x) => x.kind).join('/')}, heroes ${JSON.stringify(final.heroes)}, culture ${JSON.stringify(final.culture)}, chain ${JSON.stringify(final.quests.chain)}`,
);
