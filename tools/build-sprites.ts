// `pnpm sprites` (plan M0-08, ADR 004): runs every generator in assets-src/gen/<atlas>/<entity>/index.ts
// (assets-src/gen/lib/ is the shared library, not a generator), checks and packs the frames, and writes
// public/atlases/<atlas>.png|json (Pixi Spritesheet) plus public/atlases/index.json (the list render loads).
// The output directory is generated and git-ignored: .png/.json files of atlases that no longer exist are
// removed. Prints SHA-256 per file (two runs must print the same hashes) and atlas utilisation.
import { createHash } from 'node:crypto';
import { globSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadPalette } from '../assets-src/gen/lib/palette.ts';
import type { SpriteGenerator } from '../assets-src/gen/lib/types.ts';
import { atlasIndex, buildAtlases, SpriteBuildError } from './lib/sprites/atlas.ts';

const PALETTE = 'assets-src/palettes/master.json';
const GENERATORS = 'assets-src/gen/**/index.ts';
const LIBRARY = 'assets-src/gen/lib/';
const OUT = 'public/atlases';
const INDEX = 'index.json';

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

/** Shape check of a module's default export; the full contract is validated by buildAtlases. */
function isGenerator(value: unknown): value is SpriteGenerator {
  if (!isObject(value)) return false;
  const { atlas, id, size, frames, generate } = value;
  return (
    typeof atlas === 'string' &&
    typeof id === 'string' &&
    isObject(size) &&
    typeof size['w'] === 'number' &&
    typeof size['h'] === 'number' &&
    isObject(frames) &&
    Object.values(frames).every((n) => typeof n === 'number') &&
    typeof generate === 'function'
  );
}

async function loadGenerators(): Promise<SpriteGenerator[]> {
  // Sorted paths + sorted atlases/frames downstream: output never depends on directory listing order.
  const files = globSync(GENERATORS)
    .map((f) => f.replaceAll('\\', '/'))
    .filter((f) => !f.startsWith(LIBRARY))
    .sort();
  const generators: SpriteGenerator[] = [];
  for (const file of files) {
    const mod = (await import(pathToFileURL(resolve(file)).href)) as { default?: unknown };
    if (!isGenerator(mod.default)) throw new Error(`${file}: default export is not a SpriteGenerator`);
    generators.push(mod.default);
  }
  return generators;
}

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
