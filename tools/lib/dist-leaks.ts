// Matchers for `pnpm check:dist` (tools/check-dist.ts): debug-only code that must never reach the
// production bundle (plan M0-05/06, security.md), plus the CSP of dist/index.html (M0-12). Pure;
// unit-tested in tests/unit/tools/.
import { PROD_CSP } from './csp.ts';

export interface Leak {
  readonly what: string;
  readonly index: number;
  readonly context: string;
}

/**
 * Pixi v8 (8.23) code generators that use `new Function`, identified by their exact leading parameter names.
 * They stay in the bundle but never run: pixi.js/unsafe-eval (render/App.ts) swaps in eval-free polyfills.
 * After a Pixi upgrade a new site makes check:dist fail — review it, then add its signature here.
 *   unsafeEvalSupported (probe) · compileBufferSync · GenerateShaderSyncCode · generateUniformsSync ·
 *   generateParticleUpdateFunction
 */
export const PIXI_FUNCTION_SIGNATURES: readonly (readonly string[])[] = [
  ['param1', 'param2', 'param3', 'return param1[param2] === param3;'],
  ['uv', 'data', 'dataInt32', 'offset'],
  ['r', 's', 'sD'],
  ['ud', 'uv', 'renderer', 'syncData'],
  ['ps', 'f32v', 'u32v'],
];
const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const QUOTE = `["'\`]`;
/** Lookahead body: the argument list starts with one of the allowed signatures, then `,` or `)`. */
const PIXI_ARGS = PIXI_FUNCTION_SIGNATURES.map(
  (args) => args.map((arg) => `\\s*${QUOTE}${escapeRegExp(arg)}${QUOTE}\\s*`).join(',') + '[,)]',
).join('|');

export const FORBIDDEN: readonly (readonly [string, RegExp])[] = [
  // The URL key as parseDebugParams reads it: read("freeze", …). Pixi's own Object.freeze is not a string.
  ['debug param key "freeze"', /(["'`])freeze\1/g],
  ['URL query parsing (debug params)', /location\.search|URLSearchParams/g],
  ['debug param warning', /debug param/g],
  ['window.__CK__ debug handle', /__CK__/g],
  ['debug overlay', /debug-overlay/g],
  ['source map reference', /sourceMappingURL/g],
  // Tripwires (M0-12; the CSP blocks these at runtime, ESLint no-eval/no-new-func at source level).
  // `eval(…)` and indirect `(0,eval)(…)`; a property such as `x.eval(` or `evaluate(` is not eval.
  ['eval call', /(?<![\w$.])eval(?=\s*[()])/g],
  // `Function(…)` / `new Function(…)` (Rolldown prints the latter as the former), except the exact Pixi
  // sites in PIXI_FUNCTION_SIGNATURES.
  ['Function constructor', new RegExp(`(?<![\\w$.])Function\\s*\\((?!(?:${PIXI_ARGS}))`, 'g')],
  ['global eval / Function', /\b(?:window|globalThis|self)\s*\.\s*(?:eval|Function)\b/g],
];

/** Files that must not exist in dist/ at all: source maps and dev/test-only atlases (M0-08 review). */
export function isForbiddenFile(path: string): string | null {
  if (path.endsWith('.map')) return 'source map file';
  if (/(^|[\\/])atlases[\\/]debug\.(png|json)$/.test(path)) return 'dev/test-only atlas';
  return null;
}

/** Problems with dist/atlases/index.json: it must parse and list no dev/test-only atlas. */
export function checkAtlasIndex(text: string): string[] {
  let index: unknown;
  try {
    index = JSON.parse(text);
  } catch {
    return ['atlases/index.json is not JSON'];
  }
  const list = typeof index === 'object' && index !== null ? (index as { atlases?: unknown }).atlases : undefined;
  if (!Array.isArray(list)) return ['atlases/index.json has no "atlases" list'];
  return list
    .filter((e: unknown) => typeof e !== 'object' || e === null || (e as { debug?: unknown }).debug !== false)
    .map((e: unknown) => `atlases/index.json lists a dev/test-only or malformed atlas: ${JSON.stringify(e)}`);
}

export function findLeaks(text: string): Leak[] {
  const leaks: Leak[] = [];
  for (const [what, pattern] of FORBIDDEN) {
    for (const match of text.matchAll(pattern)) {
      const index = match.index;
      leaks.push({ what, index, context: text.slice(Math.max(0, index - 40), index + 40).replace(/\s+/g, ' ') });
    }
  }
  return leaks;
}

const CSP_META = /<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]*)"\s*\/?>/gi;

/** Problems with the CSP of the built index.html: exactly one meta policy, equal to PROD_CSP, nothing unsafe. */
export function checkIndexHtml(html: string): string[] {
  const policies = [...html.matchAll(CSP_META)].map((m) =>
    (m[1] ?? '').replaceAll('&#39;', "'").replaceAll('&quot;', '"'),
  );
  const problems: string[] = [];
  if (policies.length !== 1) problems.push(`expected 1 CSP <meta>, found ${String(policies.length)}`);
  else if (policies[0] !== PROD_CSP) problems.push(`CSP differs from PROD_CSP: ${String(policies[0])}`);
  if (/unsafe-(inline|eval|hashes)/.test(html)) problems.push("index.html mentions an 'unsafe-*' source");
  if (/<script(?![^>]*\bsrc=)[^>]*>/i.test(html)) problems.push('inline <script> in index.html');
  if (/<style[\s>]/i.test(html)) problems.push('inline <style> in index.html');
  return problems;
}
