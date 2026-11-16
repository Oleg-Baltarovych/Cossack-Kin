// Production bundle guard (plan M0-05/06/08/12, security.md): debug params, the overlay, window.__CK__,
// eval/Function, source maps and dev/test-only atlases must not reach `dist/`; dist/index.html must carry the
// strict CSP. Run after `pnpm build`: `pnpm check:dist`.
// Positive control: a `vite build --mode test` bundle must FAIL this check.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { checkAtlasIndex, checkIndexHtml, findLeaks, isForbiddenFile } from './lib/dist-leaks.ts';

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
const report = (file: string, problem: string): void => {
  problems += 1;
  console.error(`${relative('.', file)}: ${problem}`);
};

for (const file of files(DIST)) {
  const forbidden = isForbiddenFile(file);
  if (forbidden) {
    report(file, `${forbidden} in dist/`);
    continue;
  }
  if (!SCANNED.has(extname(file))) continue;
  scanned += 1;
  for (const leak of findLeaks(readFileSync(file, 'utf8'))) {
    report(file, `${String(leak.index)} ${leak.what}: …${leak.context}…`);
  }
}

if (scanned === 0) {
  console.error(`check-dist: no files in ${DIST}/ — run \`pnpm build\` first`);
  process.exit(1);
}

const required: readonly (readonly [string, (text: string) => string[]])[] = [
  ['index.html', checkIndexHtml],
  [join('atlases', 'index.json'), checkAtlasIndex],
];
for (const [path, check] of required) {
  const file = join(DIST, path);
  if (!existsSync(file)) report(file, 'missing');
  else for (const problem of check(readFileSync(file, 'utf8'))) report(file, problem);
}

if (problems > 0) {
  console.error(`check-dist: ${String(problems)} problem(s) in ${DIST}/`);
  process.exit(1);
}
console.log(`check-dist: ${String(scanned)} file(s) clean`);
