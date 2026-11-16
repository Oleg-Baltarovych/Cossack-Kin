// `pnpm sprites` (plan M0-08, ADR 004): runs every generator in assets-src/gen/<atlas>/<entity>/index.ts
// (assets-src/gen/lib/ is the shared library, not a generator), checks and packs the frames, and writes
// public/atlases/<atlas>.png|json (Pixi Spritesheet) plus public/atlases/index.json (the list render loads).
// The output directory is generated and git-ignored: .png/.json files of atlases that no longer exist are
// removed. Prints SHA-256 per file (two runs must print the same hashes) and atlas utilisation.
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { loadPalette } from '../assets-src/gen/lib/palette.ts';
import { atlasIndex, buildAtlases, SpriteBuildError } from './lib/sprites/atlas.ts';
import { loadGenerators } from './lib/sprites/load.ts';

const PALETTE = 'assets-src/palettes/master.json';
const OUT = 'public/atlases';
const INDEX = 'index.json';

const sha256 = (data: Buffer | string): string => createHash('sha256').update(data).digest('hex');

async function main(): Promise<void> {
  const palette = loadPalette(JSON.parse(readFileSync(PALETTE, 'utf8')));
  const generators = await loadGenerators();
  const atlases = buildAtlases(generators, palette);

  mkdirSync(OUT, { recursive: true });
  const written = new Set<string>();
  const write = (file: string, data: Buffer | string): void => {
    writeFileSync(join(OUT, file), data);
    written.add(file);
    console.log(`${sha256(data)}  ${OUT}/${file}`);
  };
  for (const atlas of atlases) {
    write(`${atlas.name}.png`, atlas.png);
    write(`${atlas.name}.json`, atlas.jsonText);
    const { w, h } = atlas.json.meta.size;
    const frames = Object.keys(atlas.json.frames).length;
    const used = (atlas.utilisation * 100).toFixed(1);
    console.log(`  ${atlas.name}: ${String(w)}×${String(h)} px, ${String(frames)} frame(s), ${used}% used`);
  }
  write(INDEX, `${JSON.stringify(atlasIndex(atlases), null, 2)}\n`);

  const stale = readdirSync(OUT).filter((f) => !written.has(f) && ['.png', '.json'].includes(extname(f)));
  for (const file of stale) rmSync(join(OUT, file));
  console.log(`sprites: ${String(generators.length)} generator(s) → ${String(atlases.length)} atlas(es) in ${OUT}/`);
}

main().catch((error: unknown) => {
  console.error(error instanceof SpriteBuildError ? error.message : error);
  process.exit(1);
});
