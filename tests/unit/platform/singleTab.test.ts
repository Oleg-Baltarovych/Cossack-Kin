import { describe, expect, it } from 'vitest';
import { claimTab } from '../../../src/platform/singleTab.ts';

/** A tiny LockManager stand-in: one holder per name, `ifAvailable` gets null when taken. */
function fakeLocks(): LockManager {
  const held = new Set<string>();
  const request = (name: string, options: LockOptions, cb: (lock: Lock | null) => unknown): Promise<unknown> => {
    if (options.ifAvailable && held.has(name)) return Promise.resolve(cb(null));
    held.add(name);
    return Promise.resolve(cb({ name, mode: 'exclusive' }));
  };
  return { request, query: () => Promise.resolve({}) } as unknown as LockManager; // test double: only request() is used
}

describe('claimTab (M1-13)', () => {
  it('the first tab owns the game, a second one is told it runs elsewhere', async () => {
    const locks = fakeLocks();
    expect(await claimTab(locks)).toBe('owner');
    expect(await claimTab(locks)).toBe('elsewhere');
  });

  it('without the Locks API the game runs', async () => {
    expect(await claimTab(null)).toBe('owner');
  });
});
