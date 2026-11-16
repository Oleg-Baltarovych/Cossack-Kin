// Generator discovery shared by `pnpm sprites` and `pnpm sprites:sheet`: every assets-src/gen/<atlas>/<entity>/index.ts
// (assets-src/gen/lib/ is the shared library, not a generator), imported in sorted path order.
import { globSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { SpriteGenerator } from '../../../assets-src/gen/lib/types.ts';

const GENERATORS = 'assets-src/gen/**/index.ts';
const LIBRARY = 'assets-src/gen/lib/';

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

export async function loadGenerators(): Promise<SpriteGenerator[]> {
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
