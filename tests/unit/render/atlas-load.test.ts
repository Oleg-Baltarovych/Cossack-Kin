// Atlas loading lifecycle (M2-09 review): a partial load never leaks the sheets that did load.
import { describe, expect, it } from 'vitest';
import { loadSheets, pixiAtlases, type SheetLoader } from '../../../src/render/atlases.ts';

function fakeLoader(failing: ReadonlySet<string>): SheetLoader<string> & { loaded: Set<string> } {
  const loaded = new Set<string>();
  return {
    loaded,
    load: (url) => {
      if (failing.has(url)) return Promise.reject(new Error(`404 ${url}`));
      loaded.add(url);
      return Promise.resolve(`sheet:${url}`);
    },
    unload: (url) => {
      loaded.delete(url);
      return Promise.resolve();
    },
  };
}
const URLS = new Map([
  ['khortytsia', 'a/khortytsia.json'],
  ['people', 'a/people.json'],
  ['sky', 'a/sky.json'],
]);

describe('loadSheets', () => {
  it('returns every sheet by name when all load', async () => {
    const loader = fakeLoader(new Set());
    const sheets = await loadSheets(URLS, loader);
    expect([...sheets]).toEqual([
      ['khortytsia', 'sheet:a/khortytsia.json'],
      ['people', 'sheet:a/people.json'],
      ['sky', 'sheet:a/sky.json'],
    ]);
    expect(loader.loaded.size).toBe(3);
  });

  it('unloads the sheets that loaded and rethrows when one fails', async () => {
    const loader = fakeLoader(new Set(['a/people.json']));
    await expect(loadSheets(URLS, loader)).rejects.toThrow('404 a/people.json');
    expect(loader.loaded.size).toBe(0);
  });
});

// M3-11 (M3-10 follow-up): the DOM-only atlases (`ui` icons, the raid `map`) never reach Pixi — only the world's own
// atlases and, in a dev/test build, the debug ones.
describe('pixiAtlases', () => {
  const index = {
    version: 1,
    atlases: ['debug', 'khortytsia', 'map', 'people', 'sky', 'ui'].map((name) => ({
      name,
      json: `${name}.json`,
      debug: name === 'debug',
    })),
  };

  it('loads only the world atlases (and debug ones in a debug build)', () => {
    expect(pixiAtlases(index, true).map((e) => e.name)).toEqual(['debug', 'khortytsia', 'people', 'sky']);
    expect(pixiAtlases(index, false).map((e) => e.name)).toEqual(['khortytsia', 'people', 'sky']);
  });

  it('still refuses a malformed index', () => {
    expect(() => pixiAtlases({ atlases: [{ name: 'sky', json: '../x.json', debug: false }] }, false)).toThrow(
      /bad entry 0/,
    );
    expect(() => pixiAtlases({}, false)).toThrow(/missing "atlases"/);
  });
});
