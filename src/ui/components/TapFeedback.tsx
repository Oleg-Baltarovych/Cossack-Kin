// Tapping the world (SPEC §2.1, §6.7; plan M1-19): render reports where the world was tapped, the UI dispatches the
// `tap` action, and when the core accepts it (`Tapped`) the ducats float up from the finger — the coin itself is
// render's (bridge.ts). A refused tap (over 10/s, plan Q8) shows nothing.
import { useEffect, useState } from 'react';
import type { WorldApp } from '../../render/index.ts';
import { useAct } from '../hooks/useGame.ts';
import { useText } from '../hooks/useText.ts';
import styles from './TapFeedback.module.css';

interface Floater {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly text: string;
}

/** How long a number floats (matches the CSS animation). */
const FLOAT_MS = 700;
/** At most this many numbers at once (10 taps/s × 0.7 s). */
const MAX_FLOATERS = 8;

let nextId = 0;

export function TapFeedback({ world }: { world: WorldApp | null }) {
  const act = useAct();
  const { t, num } = useText();
  const [floaters, setFloaters] = useState<readonly Floater[]>([]);

  useEffect(() => {
    if (!world) return;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const off = world.onTap((tap) => {
      const tapped = act({ type: 'tap' }).find((e) => e.type === 'Tapped');
      if (!tapped) return;
      const id = (nextId += 1);
      const text = t('ui.tap.gain', { value: num(tapped.amount) });
      setFloaters((list) => [...list.slice(-(MAX_FLOATERS - 1)), { id, x: tap.clientX, y: tap.clientY, text }]);
      const timer = setTimeout(() => {
        timers.delete(timer);
        setFloaters((list) => list.filter((f) => f.id !== id));
      }, FLOAT_MS);
      timers.add(timer);
    });
    return () => {
      off();
      for (const timer of timers) clearTimeout(timer);
      setFloaters([]);
    };
  }, [world, act, t, num]);

  return (
    <div className={styles.layer} aria-hidden="true">
      {floaters.map((f) => (
        <span key={f.id} className={styles.floater} style={{ left: f.x, top: f.y }}>
          {f.text}
        </span>
      ))}
    </div>
  );
}
