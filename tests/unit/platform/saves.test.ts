// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Big } from '../../../src/core/big.ts';
import { decodeSave, encodeSave, SAVE_VERSION } from '../../../src/core/save/serialize.ts';
import { createInitialState, type GameState } from '../../../src/core/state.ts';
import { createStore } from '../../../src/core/store.ts';
import { startAutosave, SAVE_EVERY_MS } from '../../../src/platform/autosave.ts';
import { bootGame } from '../../../src/platform/saves.ts';
import { memoryStorage, webStorage, type StorageService } from '../../../src/platform/storage.ts';

const T0 = 1_763_400_000_000;

function game(field = 5, lastSeen = T0): GameState {
  const s = createInitialState({ seed: 8, now: T0 });
  return {
    ...s,
    time: { ...s.time, lastSeen, maxSeen: lastSeen },
    currencies: { ...s.currencies, ducats: Big.from(1e9) },
    village: { ...s.village, levels: { ...s.village.levels, field } },
  };
}

const fresh = (): GameState => game(0);

async function slots(storage: StorageService): Promise<[string | null, string | null]> {
  return [await storage.load('a'), await storage.load('b')];
}

afterEach(() => {
  vi.useRealTimers();
  localStorage.clear();
});

describe('bootGame + saver: two rotating slots (M1-13)', () => {
  it('no save: a fresh game; saves then alternate a, b, a — the last good copy is never the one overwritten', async () => {
    const storage = memoryStorage();
    const boot = await bootGame(storage, fresh);
    expect(boot.notice).toBe('none');
    boot.saver.save(game(1));
    boot.saver.save(game(2));
    let [a, b] = await slots(storage);
    expect([a && decodeSave(a).ok, b && decodeSave(b).ok]).toEqual([true, true]);
    boot.saver.save(game(3));
    [a, b] = await slots(storage);
    const field = (raw: string | null): number | null => {
      const r = raw === null ? null : decodeSave(raw);
      return r?.ok ? r.state.village.levels.field : null;
    };
    expect([field(a), field(b)]).toEqual([3, 2]);
  });

  it('loads the later slot and writes the next save over the other one', async () => {
    const storage = memoryStorage();
    await storage.save('a', encodeSave(game(7, T0 + 1000)));
    await storage.save('b', encodeSave(game(6, T0)));
    const boot = await bootGame(storage, fresh);
    expect(boot.state.village.levels.field).toBe(7);
    boot.saver.save(game(8, T0 + 2000));
    const [a, b] = await slots(storage);
    expect(a).toBe(encodeSave(game(7, T0 + 1000)));
    expect(b).toBe(encodeSave(game(8, T0 + 2000), 1));
  });

  it('a corrupted save_a → save_b, with the «restored» notice', async () => {
    const storage = memoryStorage();
    await storage.save('a', encodeSave(game(9, T0 + 5000)).replace(/"checksum":"\w+"/, '"checksum":"deadbeef"'));
    await storage.save('b', encodeSave(game(4)));
    const boot = await bootGame(storage, fresh);
    expect([boot.notice, boot.state.village.levels.field]).toEqual(['restored', 4]);
  });

  it('both corrupted → a fresh game with the «corrupt» notice; the damaged text is kept aside first', async () => {
    const storage = memoryStorage();
    await storage.save('a', '{');
    await storage.save('b', 'garbage');
    const boot = await bootGame(storage, fresh);
    expect([boot.notice, boot.state.village.levels.field]).toEqual(['corrupt', 0]);
    expect([...storage.backups.entries()]).toEqual([
      ['a', '{'],
      ['b', 'garbage'],
    ]);
  });

  it('a storage that cannot be read: play on, but never write over the slots we could not see', async () => {
    const inner = memoryStorage();
    const storage = { ...inner, load: () => Promise.reject(new Error('SecurityError')) };
    const boot = await bootGame(storage, fresh);
    expect([boot.notice, boot.saver.enabled]).toEqual(['unavailable', false]);
    boot.saver.save(game(3));
    expect(await slots(inner)).toEqual([null, null]);
  });

  it('the write counter continues after a load, so the next save wins a tie on lastSeen', async () => {
    const storage = memoryStorage();
    await storage.save('a', encodeSave(game(4), 41));
    const boot = await bootGame(storage, fresh);
    boot.saver.save(game(5));
    const b = await storage.load('b');
    expect(b && (JSON.parse(b) as { seq: number }).seq).toBe(42);
  });

  it('a save from a newer game: «newer», play goes on in memory, nothing is ever written', async () => {
    const storage = memoryStorage();
    const future = JSON.stringify({ ...(JSON.parse(encodeSave(game(9))) as object), version: SAVE_VERSION + 1 });
    await storage.save('a', future);
    const boot = await bootGame(storage, fresh);
    expect(boot.notice).toBe('newer');
    expect(boot.saver.enabled).toBe(false);
    boot.saver.save(game(1));
    expect(await slots(storage)).toEqual([future, null]);
  });
});

describe('webStorage (M1-13)', () => {
  it('keeps the slots in localStorage under ck.save_a / ck.save_b', async () => {
    const storage = webStorage(() => localStorage);
    await storage.save('a', 'x');
    expect(localStorage.getItem('ck.save_a')).toBe('x');
    expect(await storage.load('b')).toBeNull();
  });

  it('a storage that throws (quota, private mode, even opening it) rejects instead of crashing', async () => {
    const broken = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('quota');
      },
    };
    const storage = webStorage(() => broken);
    await expect(storage.load('a')).rejects.toThrow();
    await expect(storage.save('a', 'x')).rejects.toThrow();
    const blocked = webStorage(() => {
      throw new Error('SecurityError');
    });
    await expect(blocked.load('a')).rejects.toThrow();
  });
});

describe('startAutosave (M1-13, SPEC §9.5)', () => {
  it(`saves every ${String(SAVE_EVERY_MS / 1000)} s and right after a new tier or a hired Cossack`, async () => {
    vi.useFakeTimers();
    const storage = memoryStorage();
    const boot = await bootGame(storage, fresh);
    const spy = vi.spyOn(boot.saver, 'save');
    const store = createStore(game(9));
    const stop = startAutosave(store, boot.saver);
    vi.advanceTimersByTime(SAVE_EVERY_MS);
    expect(spy).toHaveBeenCalledTimes(1);
    store.dispatch({ type: 'buyBuilding', id: 'field', mode: 1 }, T0 + 100);
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy.mock.lastCall?.[0].village.levels.field).toBe(10);
    store.dispatch({ type: 'buyBuilding', id: 'field', mode: 1 }, T0 + 200);
    expect(spy).toHaveBeenCalledTimes(2);
    store.dispatch({ type: 'hire', n: 1 }, T0 + 300);
    expect(spy).toHaveBeenCalledTimes(3);
    stop();
    vi.advanceTimersByTime(SAVE_EVERY_MS * 3);
    expect(spy).toHaveBeenCalledTimes(3);
  });
});
