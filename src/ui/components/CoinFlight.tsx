// Coins fly to the counter (plans M2-25, M2-26; SPEC §6.7): on a large income — a quest claim (`QuestClaimed`), the
// return window's «Забрати» (`ReturnClaimed`, ducats and glory each), a story beat's reward when its window closes
// (`useCoinLaunch`) — coins of that currency fly a Bézier curve from the button that was pressed to the HUD counter of
// that currency. Large = worth at least COIN_FLIGHT's first tier in seconds of that currency's income now (ui/coins.ts).
// Decoration only (aria-hidden): the counter and the read-outs say the same. «Менше руху»: none.
// The claim button tells where the press was (`useFlightOrigin`), the way the world's tap point waits for `Tapped`.
// One animation frame loop for every coin in the air: each coin's transforms were made at launch (`flightFrames`), so
// a frame only assigns a ready string when the coin moved to its next one; React renders a flight's coins once and
// removes them when it lands. The loop stops when nothing flies and is cancelled on unmount.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { COIN_FLIGHT } from '../../content/juice.ts';
import type { Big } from '../../core/big.ts';
import type { GameEvent } from '../../core/events.ts';
import { hudView } from '../../core/selectors.ts';
import type { GameState } from '../../core/state.ts';
import type { Granted } from '../../core/systems/reward.ts';
import { coinsFor, flightFrames, snap, type Point } from '../coins.ts';
import { useGameEvent, useGameReader } from '../hooks/useGame.ts';
import { lessMotion } from '../motion.ts';
import { Icon } from './Icon.tsx';
import styles from './CoinFlight.module.css';

type Currency = 'ducats' | 'glory';

interface Flights {
  /** Where the next claim was pressed (client px); `null` until a claim button is pressed. */
  readonly origin: { current: Point | null };
  readonly launch: (from: Point, currency: Currency, amount: Big) => void;
}

const Context = createContext<Flights | null>(null);

const centre = (el: Element): Point => {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
};

/**
 * For a claim button: `dispatch` runs with the press point remembered, and it is forgotten right after — the store
 * delivers the claim's event during the dispatch, so a refused press never lends its point to a later claim. Without
 * a CoinFlight above, it only dispatches.
 */
export function useFlightOrigin(): (el: Element, dispatch: () => void) => void {
  const flights = useContext(Context);
  return useCallback(
    (el: Element, dispatch: () => void) => {
      if (flights) flights.origin.current = centre(el);
      try {
        dispatch();
      } finally {
        if (flights) flights.origin.current = null;
      }
    },
    [flights],
  );
}

/** For a reward already credited (a story beat): send its coins from `el` now, if it is large (no-op without one). */
export function useCoinLaunch(): (el: Element | null, granted: Granted | null) => void {
  const flights = useContext(Context);
  return useCallback(
    (el: Element | null, granted: Granted | null) => {
      if (!flights || !el || !granted || granted.currency === 'pysanky') return;
      flights.launch(centre(el), granted.currency, granted.amount);
    },
    [flights],
  );
}

interface Coin {
  readonly key: string;
  readonly startMs: number;
  readonly frames: readonly string[];
  el: HTMLElement | null;
  /** The frame on screen; −1 before take-off, `frames.length` once landed. */
  at: number;
  readonly attach: (el: HTMLElement | null) => void;
}

interface Flight {
  readonly id: number;
  readonly currency: Currency;
  readonly coins: readonly Coin[];
  readonly endMs: number;
}

const ICON: Record<Currency, 'ducat' | 'glory'> = { ducats: 'ducat', glory: 'glory' };

/** One logical px in CSS px (`--px-n`, ui/theme.ts); 1 before the theme ran. */
function logicalPx(): number {
  const v = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--px-n'));
  return Number.isFinite(v) && v > 0 ? v : 1;
}

/** The centre of the HUD counter of `currency` (`data-counter`, Hud.tsx), or null when it is not on screen. */
function counterAt(currency: Currency): Point | null {
  const el = document.querySelector(`[data-counter="${currency}"]`);
  return el ? centre(el) : null;
}

function perSec(state: GameState, currency: Currency): Big {
  const v = hudView(state);
  return currency === 'ducats' ? v.ducatsPerSec : v.gloryPerSec;
}

/** Moves every coin in the air to its frame at `now`; returns whether a flight has landed. */
function stepCoins(active: readonly Flight[], now: number): boolean {
  let landed = false;
  for (let f = 0; f < active.length; f += 1) {
    const flight = active[f];
    if (!flight) continue;
    if (now >= flight.endMs) landed = true;
    for (let c = 0; c < flight.coins.length; c += 1) {
      const coin = flight.coins[c];
      if (!coin?.el) continue;
      const at = Math.min(Math.floor((now - coin.startMs) / COIN_FLIGHT.frameMs), coin.frames.length);
      if (at < 0 || at === coin.at) continue;
      if (coin.at < 0) coin.el.dataset['flying'] = '';
      coin.at = at;
      const frame = coin.frames[at];
      if (frame === undefined) delete coin.el.dataset['flying'];
      else coin.el.style.transform = frame;
    }
  }
  return landed;
}

let nextId = 0;

export function CoinFlight({ children }: { readonly children: ReactNode }) {
  const read = useGameReader();
  const [flights, setFlights] = useState<readonly Flight[]>([]);
  const loop = useRef<{ active: Flight[]; frame: number; tick: () => void } | null>(null);
  if (loop.current === null) {
    const l = {
      active: [] as Flight[],
      frame: 0,
      // Made once: a frame allocates no closure.
      tick: () => {
        const now = performance.now();
        if (stepCoins(l.active, now)) {
          l.active = l.active.filter((f) => now < f.endMs);
          setFlights(l.active.slice());
        }
        l.frame = l.active.length > 0 ? requestAnimationFrame(l.tick) : 0;
      },
    };
    loop.current = l;
  }

  const flightsApi = useMemo<Flights>(() => {
    const origin: { current: Point | null } = { current: null };
    const launch = (from: Point, currency: Currency, amount: Big): void => {
      const l = loop.current;
      if (!l || lessMotion()) return;
      const n = coinsFor(amount, perSec(read(), currency));
      const target = counterAt(currency);
      if (n === 0 || !target) return;
      const px = logicalPx();
      const start = snap(from, px);
      const to = snap(target, px);
      const id = (nextId += 1);
      const now = performance.now();
      const coins = Array.from({ length: n }, (_, i): Coin => {
        const coin: Coin = {
          key: `${String(id)}-${String(i)}`,
          startMs: now + i * COIN_FLIGHT.staggerMs,
          frames: flightFrames(start, to, i, n, px, { width: window.innerWidth, height: window.innerHeight }),
          el: null,
          at: -1,
          attach: (el) => {
            coin.el = el;
          },
        };
        return coin;
      });
      const endMs = now + (n - 1) * COIN_FLIGHT.staggerMs + COIN_FLIGHT.flightMs;
      l.active = [...l.active, { id, currency, coins, endMs }];
      setFlights(l.active.slice());
      if (l.frame === 0) l.frame = requestAnimationFrame(l.tick);
    };
    return { origin, launch };
  }, [read]);

  useGameEvent(
    useCallback(
      (e: GameEvent) => {
        if (e.type !== 'QuestClaimed' && e.type !== 'ReturnClaimed') return;
        const from = flightsApi.origin.current;
        flightsApi.origin.current = null;
        if (!from) return;
        if (e.type === 'ReturnClaimed') {
          flightsApi.launch(from, 'ducats', e.ducats);
          flightsApi.launch(from, 'glory', e.glory);
        } else if (e.granted && e.granted.currency !== 'pysanky') {
          flightsApi.launch(from, e.granted.currency, e.granted.amount);
        }
      },
      [flightsApi],
    ),
  );
  useEffect(
    () => () => {
      const l = loop.current;
      if (l && l.frame !== 0) cancelAnimationFrame(l.frame);
      if (l) l.frame = 0;
    },
    [],
  );

  return (
    <Context.Provider value={flightsApi}>
      {children}
      <div className={styles.layer} aria-hidden="true">
        {flights.flatMap((f) =>
          f.coins.map((c) => (
            <span
              key={c.key}
              ref={c.attach}
              className={styles.coin}
              data-coin={f.currency}
              // At the button until take-off (hidden until then: CSS shows `data-flying`).
              style={{ transform: c.frames[0], animationDuration: `${String(COIN_FLIGHT.fadeInMs)}ms` }}
            >
              <Icon id={ICON[f.currency]} />
            </span>
          )),
        )}
      </div>
    </Context.Provider>
  );
}
