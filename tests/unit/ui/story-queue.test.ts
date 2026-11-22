// The story beat queue (plan M2-25, SPEC §2.5): beats reached while away (or several at once) are shown one at a
// time, in the order the core fired them, and only once the return window (or a save notice) is gone.
import { describe, expect, it } from 'vitest';
import { Big } from '../../../src/core/big.ts';
import { EMPTY_QUEUE, shownBeat, storyQueue, type QueuedBeat } from '../../../src/ui/storyQueue.ts';

const glory = { currency: 'glory', amount: Big.from(25) } as const;
/** Closing the beat on screen (its own key). */
const close = (q: Parameters<typeof shownBeat>[0]) => ({ type: 'close', key: q.waiting[0]?.key ?? -1 }) as const;
const reached = (id: QueuedBeat['id'], granted: QueuedBeat['granted'] = null) =>
  ({ type: 'StoryBeatReached', id, granted }) as const;

describe('story queue', () => {
  it('shows nothing until a beat arrives', () => {
    expect(shownBeat(EMPTY_QUEUE, false)).toBeNull();
  });

  it('one at a time, in arrival order; closing shows the next', () => {
    let q = storyQueue(EMPTY_QUEUE, reached('khortytsia.shore'));
    q = storyQueue(q, reached('khortytsia.messenger', glory));
    q = storyQueue(q, reached('khortytsia.council', glory));
    expect(shownBeat(q, false)?.id).toBe('khortytsia.shore');
    q = storyQueue(q, close(q));
    expect(shownBeat(q, false)).toMatchObject({ id: 'khortytsia.messenger', granted: glory });
    q = storyQueue(q, close(q));
    expect(shownBeat(q, false)?.id).toBe('khortytsia.council');
    q = storyQueue(q, close(q));
    expect(shownBeat(q, false)).toBeNull();
  });

  it('waits while a window is open (the return window first), then shows the first beat', () => {
    const q = storyQueue(
      storyQueue(EMPTY_QUEUE, reached('khortytsia.messenger', glory)),
      reached('khortytsia.pokrova'),
    );
    expect(shownBeat(q, true)).toBeNull();
    expect(shownBeat(q, false)?.id).toBe('khortytsia.messenger');
  });

  it('says how many more wait after the one shown (the button reads «Далі» until the last)', () => {
    let q = storyQueue(storyQueue(EMPTY_QUEUE, reached('khortytsia.shore')), reached('khortytsia.messenger'));
    expect(shownBeat(q, false)?.more).toBe(1);
    q = storyQueue(q, close(q));
    expect(shownBeat(q, false)?.more).toBe(0);
  });

  it('a new beat under an open one waits its turn; each shown beat has its own key (a new modal, focus moved)', () => {
    let q = storyQueue(EMPTY_QUEUE, reached('khortytsia.shore'));
    const first = shownBeat(q, false);
    q = storyQueue(q, reached('khortytsia.messenger'));
    expect(shownBeat(q, false)).toEqual({ ...first, more: 1 });
    q = storyQueue(q, close(q));
    expect(shownBeat(q, false)?.key).not.toBe(first?.key);
  });

  it('closing with nothing shown changes nothing', () => {
    expect(storyQueue(EMPTY_QUEUE, { type: 'close', key: 0 })).toBe(EMPTY_QUEUE);
  });

  it('a stale or repeated close (a double click, a StrictMode double effect) closes only the beat it was for', () => {
    let q = storyQueue(EMPTY_QUEUE, reached('khortytsia.shore'));
    q = storyQueue(q, reached('khortytsia.messenger'));
    const first = close(q);
    q = storyQueue(q, first);
    expect(shownBeat(q, false)?.id).toBe('khortytsia.messenger');
    // The same close again: the messenger stays.
    const again = storyQueue(q, first);
    expect(again).toBe(q);
    expect(shownBeat(again, false)?.id).toBe('khortytsia.messenger');
  });

  it('a replaced game (a loaded save, a reset) drops the beats of the old one', () => {
    const q = storyQueue(EMPTY_QUEUE, reached('khortytsia.shore'));
    expect(shownBeat(storyQueue(q, { type: 'StateReplaced' }), false)).toBeNull();
  });
});
