// `pnpm luts` (plan ART-04): writes the 6 time-of-day grading LUTs (assets-src/luts/gen.ts) as 256×16 PNG
// strips to public/luts/<HHMM>.png, and the rain set (M2-29 A4) to public/luts/<HHMM>-rain.png. Generated and git-ignored like public/atlases/; stale files are removed.
// Prints SHA-256 per file (two runs must print the same hashes).
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildAllLuts, LUT_HEIGHT, LUT_WIDTH, paletteColors } from '../assets-src/luts/gen.ts';
import { lutFile, SKY_KEYS } from '../src/render/atmosphere/config.ts';
import { encodePng } from './lib/png.ts';

const PALETTE = 'assets-src/palettes/master.json';
const OUT = 'public/luts';

const palette = paletteColors(JSON.parse(readFileSync(PALETTE, 'utf8')) as { ramps: Record<string, string[]> });
const luts = buildAllLuts(palette);

mkdirSync(OUT, { recursive: true });
const written = new Set<string>();
for (const [weather, set] of [
  ['clear', luts.clear],
  ['rain', luts.rain],
] as const) {
  for (const key of SKY_KEYS) {
    const file = lutFile(key.lut, weather);
    const png = encodePng({ width: LUT_WIDTH, height: LUT_HEIGHT, data: set[key.id] });
    writeFileSync(join(OUT, file), png);
    written.add(file);
    console.log(`${createHash('sha256').update(png).digest('hex')}  ${OUT}/${file}  (${key.id}, ${weather})`);
  }
}
for (const file of readdirSync(OUT).filter((f) => !written.has(f))) rmSync(join(OUT, file));
console.log(`luts: ${String(written.size)} LUT(s) in ${OUT}/`);
