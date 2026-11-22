// Coins fly to the counter (plan M2-25, SPEC §6.7): when a quest claim pays ducats or glory (`QuestClaimed` with a
// grant), a few coins of that currency fly from the «Забрати» button that was pressed to the HUD counter of that
// currency. Decoration only (aria-hidden): the counter and the strip's status line say the same. «Менше руху»: none.
// The claim button tells where the press was (`useFlightOrigin`), the way the world's tap point waits for `Tapped`.
// M2-26 grows this into the Bézier flight of large incomes.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { COIN_FLIGHT } from '../../content/juice.ts';
import type { GameEvent } from '../../core/events.ts';
import { useGameEvent } from '../hooks/useGame.ts';
import { lessMotion } from '../motion.ts';
import { Icon } from './Icon.tsx';
import styles from './CoinFlight.module.css';

type Point = { readonly x: number; readonly y: number };
type Currency = 'ducats' | 'glory';

/** Where the next claim was pressed (client px); `null` until a claim button is pressed. */
const Origin = createContext<{ current: Point | null } | null>(null);

/** For a claim button: remember the press point before dispatching (no-op without a CoinFlight above). */
export function useFlightOrigin(): (el: Element) => void {
  const origin = useContext(Origin);
  return useCallback(
    (el: Element) => {
      if (!origin) return;
      const r = el.getBoundingClientRect();
      origin.current = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    },
    [origin],
  );
}

interface Flight {
  readonly id: number;
  readonly currency: Currency;
  readonly from: Point;
  readonly to: Point;
}

const ICON: Record<Currency, 'ducat' | 'glory'> = { ducats: 'ducat', glory: 'glory' };
const LIFE_MS = COIN_FLIGHT.flightMs + COIN_FLIGHT.staggerMs * (COIN_FLIGHT.coins - 1);

/** One logical px in CSS px (`--px-n`, ui/theme.ts); 1 before the theme ran. */
function logicalPx(): number {
  const v = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--px-n'));
  return Number.isFinite(v) && v > 0 ? v : 1;
}

/** `p` on the logical pixel grid: a coin starts and travels in whole logical px (no shimmer between device px). */
const snap = (p: Point, px: number): Point => ({ x: Math.round(p.x / px) * px, y: Math.round(p.y / px) * px });

/** The centre of the HUD counter of `currency` (`data-counter`, Hud.tsx), or null when it is not on screen. */
function counterAt(currency: Currency): Point | null {
  const el = document.querySelector(`[data-counter="${currency}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

let nextId = 0;

export function CoinFlight({ children }: { readonly children: ReactNode }) {
  const origin = useRef<Point | null>(null);
  const [flights, setFlights] = useState<readonly Flight[]>([]);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());

  useGameEvent(
    useCallback((e: GameEvent) => {
      if (e.type !== 'QuestClaimed') return;
      const from = origin.current;
      origin.current = null;
      const currency = e.granted?.currency;
      if (!from || (currency !== 'ducats' && currency !== 'glory') || lessMotion()) return;
      const target = counterAt(currency);
      if (!target) return;
      const px = logicalPx();
      const id = (nextId += 1);
      const start = snap(from, px);
      const to = snap(target, px);
      setFlights((list) => [...list, { id, currency, from: start, to }]);
      const timer = setTimeout(() => {
        timers.current.delete(timer);
        setFlights((list) => list.filter((f) => f.id !== id));
      }, LIFE_MS);
      timers.current.add(timer);
    }, []),
  );
  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const t of pending) clearTimeout(t);
    };
  }, []);

  return (
    <Origin.Provider value={origin}>
      {children}
      <div className={styles.layer} aria-hidden="true">
        {flights.flatMap((f) =>
          Array.from({ length: COIN_FLIGHT.coins }, (_, i) => (
            <span
              key={`${String(f.id)}-${String(i)}`}
              className={styles.coin}
              data-coin={f.currency}
              style={
                {
                  left: f.from.x,
                  top: f.from.y,
                  // Both ends on the logical grid: the distance is whole logical px too.
                  '--dx': `${String(f.to.x - f.from.x)}px`,
                  '--dy': `${String(f.to.y - f.from.y)}px`,
                  '--flight-ms': `${String(COIN_FLIGHT.flightMs)}ms`,
                  animationDelay: `${String(i * COIN_FLIGHT.staggerMs)}ms`,
                  // Custom properties (--dx, …) are not keys of CSSProperties; React passes them through as is.
                } as CSSProperties
              }
            >
              <span className={styles.lift} style={{ animationDelay: `${String(i * COIN_FLIGHT.staggerMs)}ms` }}>
                <Icon id={ICON[f.currency]} />
              </span>
            </span>
          )),
        )}
      </div>
    </Origin.Provider>
  );
}
