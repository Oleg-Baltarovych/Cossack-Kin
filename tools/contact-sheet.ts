// `pnpm sprites:sheet [<id>…]` (plan ART-02): renders every frame of the named generators (all when none is given)
// and writes reports/sprites/<id>.png — ×6 with a px grid, a clean ×3 preview, color/ramp counts per frame.
// Same generators and seeds as `pnpm sprites`, so the sheet shows exactly what goes into the atlas.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadPalette } from '../assets-src/gen/lib/palette.ts';
import { encodePng } from './lib/png.ts';
import { renderGenerator, SpriteBuildError } from './lib/sprites/atlas.ts';
import { colorStats, contactSheet } from './lib/sprites/contact-sheet.ts';
import { loadGenerators } from './lib/sprites/load.ts';

const PALETTE = 'assets-src/palettes/master.json';
const OUT = 'reports/sprites';

async function main(): Promise<void> {
  const palette = loadPalette(JSON.parse(readFileSync(PALETTE, 'utf8')));
  const wanted = process.argv.slice(2);
  const generators = (await loadGenerators()).filter((g) => wanted.length === 0 || wanted.includes(g.id));
  const missing = wanted.filter((id) => !generators.some((g) => g.id === id));
  if (missing.length > 0) throw new Error(`sprites:sheet: no generator with id ${missing.join(', ')}`);
  mkdirSync(OUT, { recursive: true });
  for (const gen of generators) {
    const problems: string[] = [];
    const frames = renderGenerator(gen, palette, problems);
    if (problems.length > 0) throw new SpriteBuildError(problems);
    const file = join(OUT, `${gen.id}.png`);
    writeFileSync(file, encodePng(contactSheet(frames, palette)));
    console.log(`${file}  (${String(frames.length)} frame(s))`);
    for (const f of frames) {
      const s = colorStats(f.image, palette);
      const flag = s.colors > 16 || s.ramps.length > 4 ? '  ← over ART-BIBLE §4 budget' : '';
      console.log(
        `  ${f.name}: ${String(s.colors)} colors, ${String(s.ramps.length)} ramps (${s.ramps.join(', ')})${flag}`,
      );
    }
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof SpriteBuildError ? error.message : error);
  process.exit(1);
});
