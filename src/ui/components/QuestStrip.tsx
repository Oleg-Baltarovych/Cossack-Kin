// Quests in the bottom sheet (plan M2-25 + review, SPEC §3.10, §10.3). On «Хутір» and «Січ» one line over the list
// («одним рядком», §10.3): a claim waiting — the chain step, then a chore that still pays — else the chain step
// (`stripQuestKind`), with its title, progress and reward and «Забрати» when done. On «Ще» (where §10.3 keeps the
// tasks) both lines in full: «Наказ кошового: 1 з 3», «Справа: 12 з 50», and past the day's limit the chore's grey
// «Зарахувати» with a note that it pays nothing (the M2-23 review). Everything shown comes from core selectors; the UI
// only dispatches `claimQuest`. A claim's reward is read out (role=status) and coins fly to its counter (CoinFlight).
import { memo, useCallback, useEffect, useId, useRef, useState, type RefObject } from 'react';
import type { GameEvent } from '../../core/events.ts';
import { questLineView, stripQuestKind, type QuestLineView } from '../../core/selectors.ts';
import type { GameState } from '../../core/state.ts';
import type { QuestKind } from '../../core/systems/quests.ts';
import type { Granted } from '../../core/systems/reward.ts';
import { sameView, useAct, useGame, useGameEvent } from '../hooks/useGame.ts';
import { useText } from '../hooks/useText.ts';
import { grantedText, REWARD_ICON, rewardText } from '../rewards.ts';
import { useFlightOrigin } from './CoinFlight.tsx';
import { Icon } from './Icon.tsx';
import styles from './QuestStrip.module.css';

const selectChain = (s: GameState) => questLineView(s, 'chain');
const selectChore = (s: GameState) => questLineView(s, 'chore');
const sameLine = (a: QuestLineView | null, b: QuestLineView | null): boolean =>
  a === null || b === null ? a === b : sameView(a, b);

interface LineProps {
  readonly kind: QuestKind;
  /** The one-line strip over a list (title clamped to two lines, no kind label) or the full line on «Ще». */
  readonly compact: boolean;
}

const QuestLine = memo(function QuestLine({ kind, compact }: LineProps) {
  const v = useGame(kind === 'chain' ? selectChain : selectChore, sameLine);
  const text = useText();
  const act = useAct();
  const withOrigin = useFlightOrigin();
  const noteId = useId();
  if (!v) return null;
  const title = text.t(v.titleKey, {
    count: v.target,
    level: v.target,
    building: v.buildingKey === null ? '' : text.t(v.buildingKey),
  });
  const reward = rewardText(text, v.reward);
  const progress = { progress: v.progress, target: v.target };
  // The strip drops the progress once done (the button says it); the full line always names its kind.
  const progressText = compact
    ? v.done
      ? null
      : text.t('ui.quest.progress', progress)
    : text.t(kind === 'chain' ? 'ui.quest.chainProgress' : 'ui.quest.choreProgress', progress);
  // The full lines are items of the «Ще» list; the strip's one line stands alone.
  const Box = compact ? 'div' : 'li';
  return (
    <Box className={compact ? [styles.line, styles.compact].join(' ') : styles.line} data-quest={kind}>
      <div className={styles.text}>
        <p className={styles.title}>
          <Icon id={kind === 'chain' ? 'quest' : 'milestone'} />
          <span className={styles.titleText}>{title}</span>
        </p>
        <p className={styles.meta}>
          {progressText !== null && <span className={styles.token}>{progressText}</span>}
          {v.rewarded ? (
            <span className={styles.reward}>
              <Icon id={REWARD_ICON[v.reward.kind]} />
              {reward}
            </span>
          ) : (
            <span id={noteId} className={styles.warn}>
              {text.t('ui.quest.limit')}
            </span>
          )}
        </p>
      </div>
      {v.done && (
        <button
          type="button"
          className={v.rewarded ? styles.claim : [styles.claim, styles.empty].join(' ')}
          aria-label={v.rewarded ? text.t('ui.quest.claimLabel', { reward }) : text.t('ui.quest.countLabel')}
          aria-describedby={v.rewarded ? undefined : noteId}
          onClick={(e) => {
            withOrigin(e.currentTarget, () => {
              act({ type: 'claimQuest', kind });
            });
          }}
        >
          {text.t(v.rewarded ? 'ui.quest.claim' : 'ui.quest.count')}
        </button>
      )}
    </Box>
  );
});

/** The claimed reward read out, and the focus kept in `box` when the pressed button left with its quest. */
function useClaimNews(box: RefObject<HTMLElement | null>): { readonly id: number; readonly granted: Granted } | null {
  // `claims` counts every claim (a chore past the limit too); `said` is the last reward read out.
  const [claims, setClaims] = useState(0);
  const [said, setSaid] = useState<{ readonly id: number; readonly granted: Granted } | null>(null);
  useGameEvent(
    useCallback((e: GameEvent) => {
      if (e.type !== 'QuestClaimed') return;
      setClaims((n) => n + 1);
      const granted = e.granted;
      if (granted) setSaid((prev) => ({ id: (prev?.id ?? 0) + 1, granted }));
    }, []),
  );
  useEffect(() => {
    if (claims > 0 && document.activeElement === document.body) box.current?.focus();
  }, [claims, box]);
  return said;
}

function ClaimNews({ said }: { readonly said: { readonly id: number; readonly granted: Granted } | null }) {
  const text = useText();
  return (
    <p className={styles.said} role="status">
      {/* A new key per claim: the same words twice in a row are read out again. */}
      {said && <span key={said.id}>{text.t('ui.quest.claimed', { reward: grantedText(text, said.granted) })}</span>}
    </p>
  );
}

/** The one-line strip over the «Хутір» and «Січ» lists. */
export function QuestStrip() {
  const text = useText();
  const ref = useRef<HTMLElement>(null);
  const said = useClaimNews(ref);
  const kind = useGame(stripQuestKind);
  return (
    <section ref={ref} className={styles.strip} aria-label={text.t('ui.quest.region')} tabIndex={-1}>
      <QuestLine kind={kind} compact />
      <ClaimNews said={said} />
    </section>
  );
}

/** Both quests in full, on «Ще». */
export function QuestList() {
  const text = useText();
  const ref = useRef<HTMLElement>(null);
  const said = useClaimNews(ref);
  const headingId = useId();
  return (
    <section ref={ref} className={styles.board} aria-labelledby={headingId} tabIndex={-1}>
      <h2 id={headingId} className={styles.heading}>
        {text.t('ui.quest.region')}
      </h2>
      <ul className={styles.list}>
        <QuestLine kind="chain" compact={false} />
        <QuestLine kind="chore" compact={false} />
      </ul>
      <ClaimNews said={said} />
    </section>
  );
}
