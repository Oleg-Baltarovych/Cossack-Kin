// Local notifications (SPEC §9.4, §3.9; plan M3 §0.1 П6, M3-16). M3 is only the hook: after a raid starts, a claim, a
// replaced state (a load, an import), a resume of the page and a language change the platform replans «загін
// повернувся» from the pure `raidAlerts(state)` — returns within `RAIDS.alertMergeSec` merged into one, only those still
// ahead of `now`. The permission request (after the first returned raid, Q18), the §3.9 limits and the Capacitor plugin
// come in M6/M9; until then the only service is `mockNotifications`, which shows nothing and keeps the plan for dev/e2e
// (`window.__CK_GAME__.notifications()`, ui/debug/gameDebug.ts — behind `__CK_DEBUG__`, so production drops it).
import { RAIDS } from '../content/raids.ts';
import type { GameEvent } from '../core/events.ts';
import { raidAlerts, type RaidAlert } from '../core/raid-selectors.ts';
import type { GameState } from '../core/state.ts';
import type { GameStore } from '../core/store.ts';

export type NotificationPermission = 'granted' | 'denied' | 'prompt';

/**
 * SPEC §9.4. Ids are strings here (`raid.<n>`, later `daily.<n>`…). Notes for the M6 Capacitor adapter
 * (`@capacitor/local-notifications`):
 * - the plugin takes **int** ids: the adapter maps each string id through a stable, append-only table (never a hash
 *   that could collide, never renumbered between versions, so a cancel after an update still finds the old one);
 * - inexact scheduling only (`allowWhileIdle`, no exact alarms): no `SCHEDULE_EXACT_ALARM` / `USE_EXACT_ALARM` — Play
 *   policy reserves them for alarm/calendar apps, and «загін повернувся» a few minutes late is fine;
 * - the Android channel id (name, importance) is the adapter's own; callers never pass it.
 * The permission methods exist for M6 (asked after the first returned raid, Q18); M3 never calls them.
 */
export interface NotificationService {
  /** Plans one notification at `at` (ms); the same id replaces the earlier one. */
  schedule(id: string, at: number, title: string, body: string): Promise<void>;
  cancel(id: string): Promise<void>;
  permission(): Promise<NotificationPermission>;
  requestPermission(): Promise<Exclude<NotificationPermission, 'prompt'>>;
}

export interface PlannedNotification {
  readonly id: string;
  readonly at: number;
  readonly title: string;
  readonly body: string;
}

/** The web/dev service: nothing is shown, nothing is asked; `planned()` is the current plan, in `at` order. */
export interface MockNotifications extends NotificationService {
  planned(): readonly PlannedNotification[];
}

export function mockNotifications(): MockNotifications {
  const plan = new Map<string, PlannedNotification>();
  return {
    schedule(id, at, title, body) {
      plan.set(id, { id, at, title, body });
      return Promise.resolve();
    },
    cancel(id) {
      plan.delete(id);
      return Promise.resolve();
    },
    permission: () => Promise.resolve('prompt'),
    requestPermission: () => Promise.resolve('denied'),
    planned: () => [...plan.values()].sort((a, b) => a.at - b.at),
  };
}

/** The player-facing text of an alert (the UI fills it from i18n in the player's language). */
export type RaidAlertText = (alert: RaidAlert, state: GameState) => { readonly title: string; readonly body: string };

const REPLAN: ReadonlySet<GameEvent['type']> = new Set(['RaidStarted', 'RaidClaimed', 'StateReplaced']);

/** Merged alerts never outnumber the slots: the fixed upper bound of the ids a plan can use. */
const RAID_IDS: readonly string[] = Array.from({ length: RAIDS.maxSlots }, (_, n) => `raid.${String(n)}`);

export interface RaidNotifications {
  /** Plans again from the current state at `now()` (idempotent): the lifecycle calls it on resume. */
  readonly replan: () => void;
  readonly stop: () => void;
}

/**
 * Plans the raid notifications of `store` now (the loaded game, at the real `now`: a return already due is dropped
 * even before the first tick) and after every start, claim, replaced state or language change. Each plan schedules
 * `raid.0…k-1` first (the same id replaces the old one), then cancels the ids it no longer uses, so a planned alert is
 * never missing in between. Plans run one after another; nothing here can throw into the store's event delivery.
 */
export function startRaidNotifications(
  store: Pick<GameStore, 'getState' | 'onEvents' | 'subscribe'>,
  service: NotificationService,
  text: RaidAlertText,
  now: () => number,
): RaidNotifications {
  let queue: Promise<void> = Promise.resolve();
  let stopped = false;
  const warn = (error: unknown): void => {
    console.warn('raid notifications: replanning failed', error);
  };
  const replan = (): void => {
    if (stopped) return;
    try {
      const state = store.getState();
      const t = now();
      const plan = raidAlerts(state)
        .filter((a) => a.at > t)
        .map((alert, n) => ({ id: `raid.${String(n)}`, at: alert.at, ...text(alert, state) }));
      const unused = RAID_IDS.slice(plan.length);
      queue = queue
        .then(async () => {
          await Promise.all(plan.map((p) => service.schedule(p.id, p.at, p.title, p.body)));
          await Promise.all(unused.map((id) => service.cancel(id)));
        })
        .catch(warn);
    } catch (error) {
      warn(error);
    }
  };
  replan();
  let lang = store.getState().settings.lang;
  const offEvents = store.onEvents((events) => {
    if (events.some((e) => REPLAN.has(e.type))) replan();
  });
  const offState = store.subscribe(() => {
    const next = store.getState().settings.lang;
    if (next === lang) return;
    lang = next;
    replan();
  });
  return {
    replan,
    stop: () => {
      stopped = true;
      offEvents();
      offState();
    },
  };
}
