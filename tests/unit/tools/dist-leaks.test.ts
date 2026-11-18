import { describe, expect, it } from 'vitest';
import { PROD_CSP } from '../../../tools/lib/csp.ts';
import {
  checkAtlasIndex,
  checkEntryChunks,
  checkIndexHtml,
  entryScripts,
  findLeaks,
  isForbiddenFile,
} from '../../../tools/lib/dist-leaks.ts';

describe('findLeaks', () => {
  it.each([
    ['minified params read', 'freeze:r("freeze",Ft),quality:r("quality",Qa)', 'debug param key "freeze"'],
    ['single-quoted key', "get('freeze')", 'debug param key "freeze"'],
    ['template key', 'q.get(`freeze`)', 'debug param key "freeze"'],
    ['zoom param read', 'zoom:r(`zoom`,Zt),still:r(`still`,Ft)', 'debug param key "zoom"'],
    ['tier param read', 'let n=t.get(`tier`);', 'debug param key "tier"'],
    ['location.search', 'Bt(window.location.search,"test")', 'URL query parsing (debug params)'],
    ['URLSearchParams', 'new URLSearchParams(e)', 'URL query parsing (debug params)'],
    ['warn format', 'console.warn("debug param %s=%o is invalid; using default %o",e,t,n)', 'debug param warning'],
    ['debug handle', 'window.__CK__={stats:e,settings:t}', 'window.__CK__ debug handle'],
    ['game debug handle', 'window.__CK_GAME__={state:()=>e}', 'window.__CK__ debug handle'],
    ['overlay testid', 'e.dataset.testid="debug-overlay"', 'debug overlay'],
    ['source map', '//# sourceMappingURL=index-abc.js.map', 'source map reference'],
    ['eval call', 'x=eval(s)', 'eval call'],
    ['indirect eval', '(0,eval)(s)', 'eval call'],
    ['new Function', 'f=new Function("a","return a")', 'Function constructor'],
    ['minified new Function', 'f=Function(`x`)', 'Function constructor'],
    ['Function with probe-like first arg', 'Function("param1","return 1")', 'Function constructor'],
    ['Function with a Pixi-like prefix', 'Function(`r`,`s`,`sDx`,b)', 'Function constructor'],
    ['Function with one Pixi arg', 'Function(`uv`)', 'Function constructor'],
    ['window.eval', 'window.eval(s)', 'global eval / Function'],
    ['globalThis.eval', 'globalThis.eval(s)', 'global eval / Function'],
    ['globalThis.Function', 'globalThis.Function("x")', 'global eval / Function'],
  ])('%s', (_name, text, what) => {
    expect(findLeaks(text).map((leak) => leak.what)).toContain(what);
  });

  it.each([
    ['Pixi Object.freeze', 't.filters=Object.freeze(e),r&&(n?'],
    ['identifier containing freeze', 'function freezeFrame(){}'],
    ['React unitless CSS list', '"opacity order orphans scale tabSize widows zIndex zoom fillOpacity"'],
    ['zoom as a property', 'camY:()=>k.y,zoom:()=>k.level'],
    ['tier as a property', 'tier:a(l,i),levelMax:50'],
    ['unrelated strings', 'const a="frozen",b="overlay",c="seed";'],
    // Pixi's bundled unsafe-eval probe after minification (never called: pixi.js/unsafe-eval replaces it).
    ['Pixi probe (minified)', 'try{E=Function(`param1`,`param2`,`param3`,`return param1[param2] === param3;`)'],
    [
      'Pixi probe (source)',
      'const func = new Function("param1", "param2", "param3", "return param1[param2] === param3;");',
    ],
    // Pixi's other code generators as Rolldown prints them (replaced at runtime by pixi.js/unsafe-eval).
    ['Pixi compileBufferSync', 'return Function(`uv`,`data`,`dataInt32`,`offset`,a)'],
    ['Pixi shader sync', 'return Function(`r`,`s`,`sD`,s)'],
    ['Pixi uniforms sync', 'return Function(`ud`,`uv`,`renderer`,`syncData`,x)'],
    ['Pixi particle update', 'return Function(`ps`,`f32v`,`u32v`,i)'],
    ['identifiers ending in Function', 'a.syncFunction(e);this._createUniformSyncFunction(e,t);updateFunction(x)'],
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
    expect(isForbiddenFile('dist/assets/index-abc.js.map')).toBe('source map file');
    expect(isForbiddenFile('dist/assets/index-abc.css.map')).toBe('source map file');
    expect(isForbiddenFile('dist/assets/index-abc.js')).toBeNull();
  });

  it('rejects dev/test-only atlases', () => {
    expect(isForbiddenFile('dist/atlases/debug.png')).toBe('dev/test-only atlas');
    expect(isForbiddenFile('dist\\atlases\\debug.json')).toBe('dev/test-only atlas');
    expect(isForbiddenFile('dist/atlases/khortytsia.png')).toBeNull();
  });
});

describe('checkAtlasIndex', () => {
  it('accepts production entries only', () => {
    expect(checkAtlasIndex('{"version":1,"atlases":[{"name":"a","json":"a.json","debug":false}]}')).toEqual([]);
    expect(checkAtlasIndex('{"version":1,"atlases":[]}')).toEqual([]);
  });

  it('rejects debug entries, malformed entries and bad JSON', () => {
    expect(checkAtlasIndex('{"atlases":[{"name":"debug","json":"debug.json","debug":true}]}')).toHaveLength(1);
    expect(checkAtlasIndex('{"atlases":[{"name":"x"}]}')).toHaveLength(1);
    expect(checkAtlasIndex('{"atlases":{}}')).toEqual(['atlases/index.json has no "atlases" list']);
    expect(checkAtlasIndex('nope')).toEqual(['atlases/index.json is not JSON']);
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

  it('PROD_CSP locks down every directive the plan lists (+ form-action)', () => {
    expect(PROD_CSP.split('; ')).toEqual([
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self'",
      "img-src 'self' data: blob:",
      "connect-src 'self'",
      "object-src 'none'",
      "base-uri 'none'",
      "form-action 'none'",
    ]);
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

describe('entry chunk budget (M2-04)', () => {
  const html =
    '<head><script type="module" crossorigin src="/assets/index-AB12.js"></script>' +
    '<link rel="modulepreload" crossorigin href="/assets/vendor-CD34.js"><link rel="stylesheet" href="/assets/i.css"></head>';

  it('finds the entry script and its modulepreloads (what loads before the first paint)', () => {
    expect(entryScripts(html)).toEqual(['assets/index-AB12.js', 'assets/vendor-CD34.js']);
  });

  it("accepts ' quotes and ./ or / prefixes, ignores other links and inline scripts", () => {
    const other =
      "<script type='module' src='./assets/a.js'></script><link rel='modulepreload' href='assets/b.js'>" +
      '<link rel="preload" href="/assets/c.js"><script>1</script>';
    expect(entryScripts(other)).toEqual(['assets/a.js', 'assets/b.js']);
  });

  it('budgets the sum of the start scripts in raw bytes', () => {
    const sizes = (a: number, b: number) => (path: string) => (path.includes('index') ? a : b);
    expect(checkEntryChunks(html, sizes(250_000, 250_000))).toEqual([]);
    expect(checkEntryChunks(html, sizes(250_000, 250_001))).toEqual([
      'start chunks (assets/index-AB12.js, assets/vendor-CD34.js) are 500001 bytes > 500000 (lazy-load the rest, M2-04)',
    ]);
  });

  it('fails when the entry script is missing from index.html or from dist/', () => {
    expect(checkEntryChunks('<head></head>', () => 1)).toEqual(['index.html has no entry <script src>']);
    expect(checkEntryChunks(html, () => undefined)).toEqual([
      'start chunk assets/index-AB12.js is missing',
      'start chunk assets/vendor-CD34.js is missing',
    ]);
  });
});
