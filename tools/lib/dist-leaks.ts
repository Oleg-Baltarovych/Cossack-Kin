// Matchers for `pnpm check:dist` (tools/check-dist.ts): debug-only code that must never reach the
// production bundle (plan M0-05/06, security.md). Pure; unit-tested in tests/unit/tools/.

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
