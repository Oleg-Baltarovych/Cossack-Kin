// The story beat queue (plan M2-25, SPEC §2.5). The core fires a beat and credits its reward at once
// (`StoryBeatReached`); the modal is cosmetic and comes later: beats reached while away — or several at one check —
// wait here in the order the core fired them and are shown one at a time, only while no other window is open (the
// return window and the save notice go first). Pure: a reducer over events and the modal's close, like ui/sheet.ts.
// Not saved: a beat whose modal was never seen (the page closed first) is still seen and paid in the game.
import type { StoryBeatId } from '../content/story.ts';
import type { Granted } from '../core/systems/reward.ts';

export interface QueuedBeat {
  /** Unique per arrival: a new key is a new modal (its focus and its animation start again). */
  readonly key: number;
  readonly id: StoryBeatId;
  readonly granted: Granted | null;
}

export interface StoryQueue {
  readonly waiting: readonly QueuedBeat[];
  readonly next: number;
}

export type StoryQueueAction =
  | { readonly type: 'StoryBeatReached'; readonly id: StoryBeatId; readonly granted: Granted | null }
  /** The beat with `key` was dismissed: a close for any other beat (stale, doubled) does nothing. */
  | { readonly type: 'close'; readonly key: number }
  /** The whole game was replaced: its beats belong to the old one. */
  | { readonly type: 'StateReplaced' };

export const EMPTY_QUEUE: StoryQueue = { waiting: [], next: 0 };

export function storyQueue(q: StoryQueue, a: StoryQueueAction): StoryQueue {
  switch (a.type) {
    case 'StoryBeatReached':
      return { waiting: [...q.waiting, { key: q.next, id: a.id, granted: a.granted }], next: q.next + 1 };
    case 'close':
      return q.waiting[0]?.key === a.key ? { ...q, waiting: q.waiting.slice(1) } : q;
    case 'StateReplaced':
      return q.waiting.length === 0 ? q : { ...q, waiting: [] };
  }
}

/** The beat to show now (`more` = how many wait after it), or null — always null while another window is open. */
export function shownBeat(q: StoryQueue, blocked: boolean): (QueuedBeat & { readonly more: number }) | null {
  const head = q.waiting[0];
  return blocked || !head ? null : { ...head, more: q.waiting.length - 1 };
}
