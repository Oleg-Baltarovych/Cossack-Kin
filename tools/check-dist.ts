// Production bundle guard (plan M0-05/06, security.md): debug params, the overlay, window.__CK__ and
// source maps must not reach `dist/`. Run after `pnpm build`: `pnpm check:dist`.
// Positive control: a `vite build --mode test` bundle must FAIL this check.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { findLeaks, isForbiddenFile } from './lib/dist-leaks.ts';

const DIST = process.argv[2] ?? 'dist';
const SCANNED = new Set(['.js', '.mjs', '.css', '.html']);

function* files(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* files(path);
    else yield path;
  }
}

let problems = 0;
let scanned = 0;
for (const file of files(DIST)) {
  const shown = relative('.', file);
  if (isForbiddenFile(file)) {
    problems += 1;
    console.error(`${shown}: source map file in dist/`);
    continue;
  }
  if (!SCANNED.has(extname(file))) continue;
  scanned += 1;
  for (const leak of findLeaks(readFileSync(file, 'utf8'))) {
    problems += 1;
    console.error(`${shown}:${String(leak.index)} ${leak.what}: …${leak.context}…`);
  }
}

if (scanned === 0) {
  console.error(`check-dist: no files in ${DIST}/ — run \`pnpm build\` first`);
  process.exit(1);
}
if (problems > 0) {
  console.error(`check-dist: ${String(problems)} debug leak(s) in ${DIST}/`);
  process.exit(1);
}
console.log(`check-dist: ${String(scanned)} file(s) clean`);
