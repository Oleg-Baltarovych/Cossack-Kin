// Matchers for `pnpm check:dist` (tools/check-dist.ts): debug-only code that must never reach the
// production bundle (plan M0-05/06, security.md), plus the CSP of dist/index.html (M0-12). Pure;
// unit-tested in tests/unit/tools/.
import { PROD_CSP } from './csp.ts';

export interface Leak {
  readonly what: string;
  readonly index: number;
  readonly context: string;
}

export const FORBIDDEN: readonly (readonly [string, RegExp])[] = [
  // The URL key as parseDebugParams reads it: read("freeze", …). Pixi's own Object.freeze is not a string.
  ['debug param key "freeze"', /(["'`])freeze\1/g],
  ['URL query parsing (debug params)', /location\.search|URLSearchParams/g],
  ['debug param warning', /debug param/g],
  ['window.__CK__ debug handle', /__CK__/g],
  ['debug overlay', /debug-overlay/g],
  ['source map reference', /sourceMappingURL/g],
  // Tripwires for our own code (M0-12). Rolldown prints `new Function(` as `Function(`, and Pixi's bundled
  // unsafe-eval probe `Function("param1", …)` (never called: pixi.js/unsafe-eval replaces it) must not
  // match, so a bare `Function(` is deliberately not banned. The CSP blocks both at runtime anyway.
  // `eval(…)` and indirect `(0,eval)(…)`; a property such as `x.eval(` or `evaluate(` is not eval.
  ['eval call', /(?<![\w$.])eval(?=\s*[()])/g],
  ['new Function', /\bnew\s+Function\s*\(/g],
];

/** Files that must not exist in dist/ at all. */
export function isForbiddenFile(path: string): boolean {
  return path.endsWith('.map');
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
