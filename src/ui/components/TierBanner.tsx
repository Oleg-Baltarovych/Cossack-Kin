// «Тір II» (plan M2-12, SPEC §6.7): when a building reaches a new tier a banner under the HUD names it — the world
// celebrates at the same time (render: flash, rising standard), for the same TIER_CELEBRATION_MS. Information, not
// decoration: a polite live region (role=status) that is always in the page, so screen readers hear each new tier; it
// never takes taps (the world and the panel stay usable under it). It clears when its CSS animation ends — the
// reduced-motion variant included (prefers-reduced-motion or the game's «менше руху», `data-motion`).
import { useCallback, useState, type CSSProperties } from 'react';
import { TIER_CELEBRATION_MS } from '../../content/juice.ts';
import type { GameEvent } from '../../core/events.ts';
import { tierBannerView, type TierBannerView } from '../../core/selectors.ts';
import type { GameState } from '../../core/state.ts';
import { romanTier } from '../../i18n/index.ts';
import { useGameEvent } from '../hooks/useGame.ts';
import { useText } from '../hooks/useText.ts';
import styles from './TierBanner.module.css';

interface Shown extends TierBannerView {
  readonly id: number;
}

/** The animation length as a CSS var: one source with the world's celebration. */
const DURATION = { '--banner-ms': `${String(TIER_CELEBRATION_MS)}ms` } as CSSProperties;

export function TierBanner() {
  const { t } = useText();
  const [shown, setShown] = useState<Shown | null>(null);

  useGameEvent(
    useCallback((e: GameEvent, state: GameState) => {
      if (e.type !== 'TierReached') return;
      const view = tierBannerView(state, e);
      if (!view) return;
      // A newer tier replaces the one on screen (a new key restarts its animation).
      setShown((prev) => ({ id: (prev?.id ?? 0) + 1, ...view }));
    }, []),
  );

  return (
    <div className={styles.region} role="status" aria-live="polite">
      {shown && (
        <p
          key={shown.id}
          className={styles.banner}
          style={DURATION}
          onAnimationEnd={() => {
            setShown((prev) => (prev?.id === shown.id ? null : prev));
          }}
        >
          {t('ui.tier.reached', { name: t(shown.nameKey), tier: romanTier(shown.tier) })}
        </p>
      )}
    </div>
  );
}
