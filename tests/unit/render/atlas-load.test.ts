// Atlas loading lifecycle (M2-09 review): a partial load never leaks the sheets that did load.
import { describe, expect, it } from 'vitest';
import { loadSheets, type SheetLoader } from '../../../src/render/atlases.ts';

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
