import { describe, expect, it } from 'vitest';
import { findLeaks, isForbiddenFile } from '../../../tools/lib/dist-leaks.ts';

describe('findLeaks', () => {
  it.each([
    ['minified params read', 'freeze:r("freeze",Ft),quality:r("quality",Qa)', 'debug param key "freeze"'],
    ['single-quoted key', "get('freeze')", 'debug param key "freeze"'],
    ['template key', 'q.get(`freeze`)', 'debug param key "freeze"'],
    ['location.search', 'Bt(window.location.search,"test")', 'URL query parsing (debug params)'],
    ['URLSearchParams', 'new URLSearchParams(e)', 'URL query parsing (debug params)'],
    ['warn format', 'console.warn("debug param %s=%o is invalid; using default %o",e,t,n)', 'debug param warning'],
    ['debug handle', 'window.__CK__={stats:e,settings:t}', 'window.__CK__ debug handle'],
    ['overlay testid', 'e.dataset.testid="debug-overlay"', 'debug overlay'],
    ['source map', '//# sourceMappingURL=index-abc.js.map', 'source map reference'],
  ])('%s', (_name, text, what) => {
    expect(findLeaks(text).map((leak) => leak.what)).toContain(what);
  });

  it.each([
    ['Pixi Object.freeze', 't.filters=Object.freeze(e),r&&(n?'],
    ['identifier containing freeze', 'function freezeFrame(){}'],
    ['unrelated strings', 'const a="frozen",b="overlay",c="seed";'],
  ])('clean: %s', (_name, text) => {
    expect(findLeaks(text)).toEqual([]);
  });

  it('reports position and surrounding context', () => {
    const [leak] = findLeaks('xxxxx window.__CK__ yyyyy');
    expect(leak?.index).toBe(13);
    expect(leak?.context).toContain('window.__CK__');
  });
});

describe('isForbiddenFile', () => {
  it('rejects source maps anywhere in dist', () => {
    expect(isForbiddenFile('dist/assets/index-abc.js.map')).toBe(true);
    expect(isForbiddenFile('dist/assets/index-abc.css.map')).toBe(true);
    expect(isForbiddenFile('dist/assets/index-abc.js')).toBe(false);
  });
});
