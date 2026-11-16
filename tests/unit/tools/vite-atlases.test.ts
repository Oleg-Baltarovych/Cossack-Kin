// Production builds drop dev/test-only atlases (tools/lib/vite-atlases.ts, M0-08 review).
import { describe, expect, it } from 'vitest';
import { stripDebugEntries } from '../../../tools/lib/vite-atlases.ts';

describe('stripDebugEntries', () => {
  it('keeps production atlases and lists both files of each debug atlas for deletion', () => {
    const result = stripDebugEntries({
      version: 1,
      atlases: [
        { name: 'debug', json: 'debug.json', debug: true },
        { name: 'khortytsia', json: 'khortytsia.json', debug: false },
      ],
    });
    expect(result.index).toEqual({
      version: 1,
      atlases: [{ name: 'khortytsia', json: 'khortytsia.json', debug: false }],
    });
    expect(result.remove).toEqual(['debug.json', 'debug.png']);
  });
});
