// Vite plugin (M0-08 review): production builds must not ship dev/test-only atlases (`debug: true` in
// public/atlases/index.json, e.g. the debug swatch). Vite copies public/ verbatim, so after the bundle is
// written the plugin deletes those atlas files from the output and rewrites index.json without them.
// `pnpm check:dist` verifies the result.
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Plugin } from 'vite';

interface IndexEntry {
  readonly name: string;
  readonly json: string;
  readonly debug: boolean;
}

/** Splits an atlas index into the production index and the files to delete (`<name>.json`, `<name>.png`). */
export function stripDebugEntries(index: { version: number; atlases: readonly IndexEntry[] }): {
  index: { version: number; atlases: IndexEntry[] };
  remove: string[];
} {
  const debug = index.atlases.filter((a) => a.debug);
  return {
    index: { version: index.version, atlases: index.atlases.filter((a) => !a.debug) },
    remove: debug.flatMap((a) => [a.json, `${a.name}.png`]),
  };
}

export function stripDebugAtlasesPlugin(): Plugin {
  let outDir = 'dist';
  return {
    name: 'ck-strip-debug-atlases',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const dir = join(outDir, 'atlases');
      const indexFile = join(dir, 'index.json');
      if (!existsSync(indexFile)) throw new Error(`${indexFile} is missing — run \`pnpm sprites\` before the build`);
      const { index, remove } = stripDebugEntries(
        JSON.parse(readFileSync(indexFile, 'utf8')) as { version: number; atlases: IndexEntry[] },
      );
      for (const file of remove) rmSync(join(dir, file), { force: true });
      writeFileSync(indexFile, `${JSON.stringify(index, null, 2)}\n`);
    },
  };
}
