import { describe, expect, it } from 'vitest';
import { PROD_CSP } from '../../../tools/lib/csp.ts';
import { checkIndexHtml, findLeaks, isForbiddenFile } from '../../../tools/lib/dist-leaks.ts';

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
    ['eval call', 'x=eval(s)', 'eval call'],
    ['indirect eval', '(0,eval)(s)', 'eval call'],
    ['new Function', 'f=new Function("a","return a")', 'new Function'],
  ])('%s', (_name, text, what) => {
    expect(findLeaks(text).map((leak) => leak.what)).toContain(what);
  });

  it.each([
    ['Pixi Object.freeze', 't.filters=Object.freeze(e),r&&(n?'],
    ['identifier containing freeze', 'function freezeFrame(){}'],
    ['unrelated strings', 'const a="frozen",b="overlay",c="seed";'],
    // Pixi's bundled unsafe-eval probe after minification (never called: pixi.js/unsafe-eval replaces it).
    ['Pixi probe', 'try{E=Function(`param1`,`param2`,`param3`,`return param1[param2] === param3;`)'],
    ['Pixi error text', '"Current environment does not allow unsafe-eval, please use pixi.js/unsafe-eval"'],
    ['method named eval', 'r.eval(x);t.evaluate(y)'],
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

describe('checkIndexHtml', () => {
  const meta = (policy: string): string =>
    `<meta http-equiv="Content-Security-Policy" content="${policy.replaceAll("'", '&#39;')}">`;
  const page = (head: string): string =>
    `<!doctype html><html><head>${head}<script type="module" crossorigin src="/assets/index.js"></script></head></html>`;

  it('accepts exactly the strict policy as Vite writes it', () => {
    expect(checkIndexHtml(page(meta(PROD_CSP)))).toEqual([]);
  });

  it('rejects a missing, duplicated or relaxed policy', () => {
    expect(checkIndexHtml(page(''))).toEqual(['expected 1 CSP <meta>, found 0']);
    expect(checkIndexHtml(page(meta(PROD_CSP) + meta(PROD_CSP)))).toEqual(['expected 1 CSP <meta>, found 2']);
    const relaxed = PROD_CSP.replace("script-src 'self'", "script-src 'self' 'unsafe-eval'");
    expect(checkIndexHtml(page(meta(relaxed)))).toEqual([
      `CSP differs from PROD_CSP: ${relaxed}`,
      "index.html mentions an 'unsafe-*' source",
    ]);
  });

  it('rejects inline scripts and styles', () => {
    expect(checkIndexHtml(page(meta(PROD_CSP) + '<script>alert(1)</script><style>a{}</style>'))).toEqual([
      'inline <script> in index.html',
      'inline <style> in index.html',
    ]);
  });
});
