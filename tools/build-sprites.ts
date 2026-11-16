// `pnpm sprites` (plan M0-08, ADR 004): runs every generator in assets-src/gen/**/index.ts, checks and packs
// the frames, and writes public/atlases/<atlas>.png|json (Pixi Spritesheet). The output directory is
// generated and git-ignored: files of atlases that no longer exist are removed. Prints SHA-256 per file
// (two runs must print the same hashes).
import { createHash } from 'node:crypto';
import { globSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildAtlases, SpriteBuildError } from './lib/sprites/atlas.ts';
import { loadPalette } from './lib/sprites/palette.ts';
import type { SpriteGenerator } from './lib/sprites/types.ts';

const PALETTE = 'assets-src/palettes/master.json';
const GENERATORS = 'assets-src/gen/**/index.ts';
const OUT = 'public/atlases';

function isGenerator(value: unknown): value is SpriteGenerator {
  if (typeof value !== 'object' || value === null) return false;
  const g = value as Partial<Record<keyof SpriteGenerator, unknown>>;
  return typeof g.atlas === 'string' && typeof g.id === 'string' && typeof g.generate === 'function';
}

async function loadGenerators(): Promise<SpriteGenerator[]> {
  // Sorted paths + sorted atlases/frames downstream: output never depends on directory listing order.
  const files = globSync(GENERATORS)
    .map((f) => f.replaceAll('\\', '/'))
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
  for (const atlas of atlases) {
    for (const [file, data] of [
      [`${atlas.name}.png`, atlas.png],
      [`${atlas.name}.json`, atlas.jsonText],
    ] as const) {
      writeFileSync(join(OUT, file), data);
      written.add(file);
      console.log(`${sha256(data)}  ${OUT}/${file}`);
    }
    const { w, h } = atlas.json.meta.size;
    const frames = Object.keys(atlas.json.frames).length;
    console.log(`  ${atlas.name}: ${String(w)}×${String(h)} px, ${String(frames)} frame(s)`);
  }
  for (const stale of readdirSync(OUT).filter((f) => !written.has(f))) rmSync(join(OUT, stale), { recursive: true });
  console.log(`sprites: ${String(generators.length)} generator(s) → ${String(atlases.length)} atlas(es) in ${OUT}/`);
}

main().catch((error: unknown) => {
  console.error(error instanceof SpriteBuildError ? error.message : error);
  process.exit(1);
});
