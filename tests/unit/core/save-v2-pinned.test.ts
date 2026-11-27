// The v1 → v2 migration is frozen to the beats of v2 (M4-08 review, rules/core.md «migrations never read live
// beats»): with every live trigger moved out of reach and a live beat added, the v1 fixture migrates to the very same
// `story.seen` as with the shipped content.
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { migrate, MIGRATIONS } from '../../../src/core/save/migrations/index.ts';

vi.mock('../../../src/content/story.ts', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../../src/content/story.ts')>();
  // Every live trigger out of reach: a migration that read them would mark nothing but the start seen.
  const beats = real.STORY_BEATS.map((b) => ({ ...b, trigger: { kind: 'hired', count: Number.MAX_SAFE_INTEGER } }));
  return { ...real, STORY_BEATS: beats };
});

const payload = (JSON.parse(readFileSync('tests/fixtures/saves/v1.json', 'utf8')) as { payload: string }).payload;

describe('migration v1 → v2 does not read live story content (M4-08 review)', () => {
  it('the v1 fixture gets the v2 beats its v2 triggers met, whatever the live triggers say', () => {
    const m = migrate(JSON.parse(payload), 1, MIGRATIONS, 2);
    if (!m.ok) throw new Error('migration');
    expect((m.value as { story: unknown }).story).toEqual({
      seen: ['khortytsia.shore', 'khortytsia.messenger', 'khortytsia.council'],
    });
  });
});
