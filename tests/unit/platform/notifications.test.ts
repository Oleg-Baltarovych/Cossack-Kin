// The «загін повернувся» hook (plan M3 §0.1 П6, M3-16): after a raid starts, a claim, a replaced state, a resume or a
// language change the platform replans from `raidAlerts(state)` — schedule `raid.0…k-1` (the same id replaces), then
// cancel the rest, so there is never a moment without the alert. Only future returns are planned. No permission and no
// plugin in M3 (M6/M9): the web/dev service only remembers the plan.
import { describe, expect, it, vi } from 'vitest';
import { Big } from '../../../src/core/big.ts';
import { createInitialState, type GameState } from '../../../src/core/state.ts';
import type { RaidSlot } from '../../../src/core/systems/raids.ts';
import { createStore } from '../../../src/core/store.ts';
import {
  mockNotifications,
  startRaidNotifications,
  type NotificationService,
  type RaidAlertText,
} from '../../../src/platform/notifications.ts';

const NOW = 1_780_315_800_000;
const MIN = 60_000;
const IDLE: RaidSlot = { kind: 'idle' };

const running = (returnAt: number): RaidSlot => ({
  kind: 'running',
  raid: {
    region: 'porohy',
    tier: 'm30',
    startedAt: returnAt - 30 * MIN,
    returnAt,
    success: true,
    rumor: false,
    loot: { ducats: Big.from(10), glory: Big.from(1), pysanky: 0, relic: null },
  },
});

const withSlots = (slots: readonly RaidSlot[], now = NOW): GameState => {
  const s = createInitialState({ seed: 1, now });
  return { ...s, army: { infantry: 5 }, raids: { ...s.raids, slots } };
};

const text: RaidAlertText = (alert, state) => ({
  title: `${state.settings.lang} back`,
  body: `squads ${String(alert.count)}`,
});

/** Lets the service's promise chain run. */
const settle = () => new Promise((r) => setTimeout(r, 0));

/** A service that records its calls in order. */
function recorder(): NotificationService & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    schedule: (id, at) => {
      calls.push(`schedule ${id} ${String(at)}`);
      return Promise.resolve();
    },
    cancel: (id) => {
      calls.push(`cancel ${id}`);
      return Promise.resolve();
    },
    permission: () => Promise.resolve('prompt'),
    requestPermission: () => Promise.resolve('denied'),
  };
}

const clock = (t = NOW) => {
  const c = { t, now: () => c.t };
  return c;
};

describe('raid notifications (M3-16)', () => {
  it('two raids back within 30 minutes of each other make one entry, at the later return', async () => {
    const store = createStore(withSlots([IDLE, IDLE, IDLE]));
    const service = mockNotifications();
    startRaidNotifications(store, service, text, clock().now);
    store.replace(withSlots([running(NOW + 40 * MIN), running(NOW + 60 * MIN), IDLE]));
    await settle();
    expect(service.planned()).toEqual([{ id: 'raid.0', at: NOW + 60 * MIN, title: 'uk back', body: 'squads 2' }]);
  });

  it('returns further apart make one entry each, ids raid.<n> in return order', async () => {
    const store = createStore(withSlots([IDLE, IDLE, IDLE]));
    const service = mockNotifications();
    startRaidNotifications(store, service, text, clock().now);
    store.replace(withSlots([running(NOW + 120 * MIN), running(NOW + 30 * MIN), IDLE]));
    await settle();
    expect(service.planned().map((p) => [p.id, p.at])).toEqual([
      ['raid.0', NOW + 30 * MIN],
      ['raid.1', NOW + 120 * MIN],
    ]);
  });

  it('schedules first (the same id replaces), then cancels only the ids left over — never a gap', async () => {
    const store = createStore(withSlots([running(NOW + 30 * MIN), running(NOW + 120 * MIN), IDLE]));
    const service = recorder();
    startRaidNotifications(store, service, text, clock().now);
    await settle();
    service.calls.length = 0;
    store.replace(withSlots([running(NOW + 45 * MIN), IDLE, IDLE]));
    await settle();
    expect(service.calls).toEqual([`schedule raid.0 ${String(NOW + 45 * MIN)}`, 'cancel raid.1', 'cancel raid.2']);
  });

  it('a squad back but not yet claimed (or due before now) is not planned', async () => {
    const c = clock(NOW + 10 * MIN);
    const back = (() => {
      const s = withSlots([running(NOW + 5 * MIN), IDLE, IDLE]);
      return createStore(s);
    })();
    back.tick(c.t); // returned, unclaimed
    expect(back.getState().raids.slots[0]?.kind).toBe('returned');
    const service = mockNotifications();
    startRaidNotifications(back, service, text, c.now);
    await settle();
    expect(service.planned()).toEqual([]);
    // A loaded save before its first tick: the slot still says running, but its return is in the past.
    const stale = mockNotifications();
    startRaidNotifications(createStore(withSlots([running(NOW + 5 * MIN), IDLE, IDLE])), stale, text, c.now);
    await settle();
    expect(stale.planned()).toEqual([]);
  });

  it('plans the loaded state at start; a return alone changes nothing; a claim leaves nothing planned', async () => {
    const store = createStore(withSlots([running(NOW + 5 * MIN), IDLE, IDLE]));
    const service = mockNotifications();
    const c = clock();
    startRaidNotifications(store, service, text, c.now);
    await settle();
    expect(service.planned()).toHaveLength(1);
    c.t = NOW + 5 * MIN;
    store.tick(c.t);
    await settle();
    expect(service.planned()).toHaveLength(1);
    expect(store.dispatch({ type: 'claimRaid', slot: 0 }, c.t).map((e) => e.type)).toContain('RaidClaimed');
    await settle();
    expect(service.planned()).toEqual([]);
  });

  it('replan() (the lifecycle resume) drops what is due by then', async () => {
    const store = createStore(withSlots([running(NOW + 5 * MIN), running(NOW + 90 * MIN), IDLE]));
    const service = mockNotifications();
    const c = clock();
    const plan = startRaidNotifications(store, service, text, c.now);
    await settle();
    expect(service.planned()).toHaveLength(2);
    c.t = NOW + 10 * MIN;
    plan.replan();
    await settle();
    expect(service.planned().map((p) => [p.id, p.at])).toEqual([['raid.0', NOW + 90 * MIN]]);
  });

  it('a language change replans in the new language; other settings do not', async () => {
    const store = createStore(withSlots([running(NOW + 30 * MIN), IDLE, IDLE]));
    const service = recorder();
    startRaidNotifications(store, service, text, clock().now);
    await settle();
    service.calls.length = 0;
    store.dispatch({ type: 'setSettings', numberFormat: store.getState().settings.numberFormat }, NOW);
    store.tick(NOW + 1000);
    await settle();
    expect(service.calls).toEqual([]);
    const mock = mockNotifications();
    startRaidNotifications(store, mock, text, clock().now);
    store.dispatch({ type: 'setSettings', lang: 'en' }, NOW + 1000);
    await settle();
    expect(mock.planned()[0]?.title).toBe('en back');
  });

  it('a clock set back keeps returnAt: the alert stays at the same moment', async () => {
    const store = createStore(withSlots([running(NOW + 60 * MIN), IDLE, IDLE]));
    const service = mockNotifications();
    const c = clock();
    const plan = startRaidNotifications(store, service, text, c.now);
    await settle();
    c.t = NOW - 3 * 3600_000;
    store.resume(c.t);
    plan.replan();
    await settle();
    expect(service.planned().map((p) => p.at)).toEqual([NOW + 60 * MIN]);
  });

  it('a throwing text or service never breaks the store’s event delivery', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const store = createStore(withSlots([IDLE, IDLE, IDLE]));
    const boom: RaidAlertText = () => {
      throw new Error('boom');
    };
    startRaidNotifications(store, mockNotifications(), boom, clock().now);
    const seen: string[] = [];
    store.onEvents((events) => seen.push(...events.map((e) => e.type)));
    expect(() => {
      store.replace(withSlots([running(NOW + 5 * MIN), IDLE, IDLE]));
    }).not.toThrow();
    expect(seen).toEqual(['StateReplaced']);
    const failing = { ...recorder(), schedule: () => Promise.reject(new Error('plugin')) };
    startRaidNotifications(store, failing, text, clock().now);
    await settle();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('after stop nothing is replanned', async () => {
    const store = createStore(withSlots([IDLE, IDLE, IDLE]));
    const service = mockNotifications();
    const plan = startRaidNotifications(store, service, text, clock().now);
    store.replace(withSlots([running(NOW + 5 * MIN), IDLE, IDLE]));
    await settle();
    expect(service.planned()).toHaveLength(1);
    plan.stop();
    store.replace(withSlots([IDLE, IDLE, IDLE]));
    store.dispatch({ type: 'setSettings', lang: 'en' }, NOW);
    await settle();
    expect(service.planned()).toHaveLength(1);
  });

  it('the mock asks nothing: permission «prompt», a request «denied» (the real prompt is M6)', async () => {
    const service = mockNotifications();
    expect(await service.permission()).toBe('prompt');
    expect(await service.requestPermission()).toBe('denied');
  });
});
