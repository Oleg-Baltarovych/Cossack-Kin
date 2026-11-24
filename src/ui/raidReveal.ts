// The chest window's model (plan M3-12, §0.1 П4/П11/П12): what a claim brought, in the order the chest gives it, and
// when each piece shows. The core granted the loot already (`RaidClaimed`); the window only tells of it, so this is
// pure cosmetics — timing from content RAID_REVEAL. The claims of one action (one «Забрати все») are one window; a
// window waits while another window is open, like the story beats (ui/storyQueue.ts). Not saved.
import { RAID_REVEAL } from '../content/juice.ts';
import type { RelicId } from '../content/relics.ts';
import type { Big } from '../core/big.ts';
import type { GameEvent } from '../core/events.ts';

export type ChestClaim = Omit<Extract<GameEvent, { type: 'RaidClaimed' }>, 'type'>;

/** One thing out of the chest, of the claim at `claim` (index in the window's claims). */
export type ChestItem = { readonly claim: number } & (
  | { readonly kind: 'ducats' | 'glory'; readonly amount: Big }
  | { readonly kind: 'pysanky'; readonly n: number }
  | { readonly kind: 'relic'; readonly id: RelicId }
);

/** Every claim's ducats, glory, pysanky, then its relic — what it brought only (a failure has no relic, never a 0). */
export function chestItems(claims: readonly ChestClaim[]): readonly ChestItem[] {
  return claims.flatMap((c, claim): ChestItem[] => [
    ...(c.granted.ducats.gt(0) ? [{ claim, kind: 'ducats' as const, amount: c.granted.ducats }] : []),
    ...(c.granted.glory.gt(0) ? [{ claim, kind: 'glory' as const, amount: c.granted.glory }] : []),
    ...(c.granted.pysanky > 0 ? [{ claim, kind: 'pysanky' as const, n: c.granted.pysanky }] : []),
    ...(c.relic !== null ? [{ claim, kind: 'relic' as const, id: c.relic }] : []),
  ]);
}

export interface RevealTiming {
  readonly shakeMs: number;
  readonly itemStepMs: number;
  readonly relicMs: number;
}

/**
 * When each item shows (ms after the window opened): the first as the shake ends and the chest opens, then one every
 * `itemStepMs`; a relic is its own beat — the next item waits `relicMs` after it.
 */
export function revealTimes(items: readonly ChestItem[], timing: RevealTiming = RAID_REVEAL): readonly number[] {
  let at = timing.shakeMs;
  return items.map((item) => {
    const now = at;
    at += item.kind === 'relic' ? timing.relicMs : timing.itemStepMs;
    return now;
  });
}

export interface ChestWindow {
  /** Unique per window: a new key is a new window (its focus and its reveal start again). */
  readonly key: number;
  readonly claims: readonly ChestClaim[];
}

export interface ChestQueue {
  readonly waiting: readonly ChestWindow[];
  readonly next: number;
}

export type ChestQueueAction =
  /** One change's events (`store.onEvents`): its claims, if any, are one window. */
  | { readonly type: 'events'; readonly events: readonly GameEvent[] }
  /** The window with `key` was closed: a close for any other (stale, doubled) does nothing. */
  | { readonly type: 'close'; readonly key: number };

export const EMPTY_CHESTS: ChestQueue = { waiting: [], next: 0 };

export function chestQueue(q: ChestQueue, a: ChestQueueAction): ChestQueue {
  if (a.type === 'close') return q.waiting[0]?.key === a.key ? { ...q, waiting: q.waiting.slice(1) } : q;
  // A loaded save or a reset: the windows belong to the old game.
  if (a.events.some((e) => e.type === 'StateReplaced')) return q.waiting.length === 0 ? q : { ...q, waiting: [] };
  const claims = a.events.flatMap((e): ChestClaim[] =>
    e.type === 'RaidClaimed'
      ? [{ slot: e.slot, tier: e.tier, region: e.region, success: e.success, granted: e.granted, relic: e.relic }]
      : [],
  );
  if (claims.length === 0) return q;
  return { waiting: [...q.waiting, { key: q.next, claims }], next: q.next + 1 };
}
