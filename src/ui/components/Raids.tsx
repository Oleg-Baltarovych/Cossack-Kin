// The «Походи» block on «Січ» (plan M3-09; SPEC §3.4, §10; plan §0.1 П1/П4/П10/П12). Over the Sich list: the army's
// power with the found relics' badges (Q10), «Забрати все · N» from two returned raids (Q17), then one card per open
// slot —
//   idle      one line «Загін N · чекає наказу» + «Обрати похід» (opens the raid map for that slot: `onChoose`, M3-11;
//             without it — a list shown on its own — no button at all, never one that does nothing);
//   running   tier and region, the time left in two units (seconds only in the last minute), «повернуться о 21:40» /
//             «завтра о 06:10» on the game's clock (`settings.tzOffsetMin`, the day the quests count) and the road bar —
//             no chance and no result (M3-06: the view has none);
//   returned  «Забрати» and «Ще раз» (one action: claim, then the same tier from the same slot; off with its reason
//             when the army is too weak for it now).
// The clock is the store's (`time.lastSeen`, ticked at 10 Hz like the HUD): no timer of its own. A card re-renders
// only when what it shows changes — a running one when its countdown text does (once a minute, each second in the last
// one); an unchanged slot keeps its view object. Everything shown comes from core selectors; the cards only dispatch.
// One status line reads out a slot's change of state, a claim's loot (the chest window is M3-12) and a refused
// «Ще раз» — never the countdown. Disabled buttons follow the rows (`disabled` + the reason as its description).
import { memo, useCallback, useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import type { RaidTierId, RegionId } from '../../content/raids.ts';
import type { GameEvent } from '../../core/events.ts';
import { raidSlotsView, relicsView, type RaidSlotView, type RelicView } from '../../core/raid-selectors.ts';
import type { GameState } from '../../core/state.ts';
import { raidPower, raidTier } from '../../core/systems/raids.ts';
import { countdownShown, formatCountdown, formatReturnAt } from '../../i18n/index.ts';
import { sameView, useAct, useGame, useGameEvent } from '../hooks/useGame.ts';
import { useText, type Text } from '../hooks/useText.ts';
import { lootText, raidWhere, tierName } from '../raidText.ts';
import { Icon } from './Icon.tsx';
import styles from './Raids.module.css';

const PERCENT = 100;

/** A slot as its card shows it: the core's view, the game clock it was read at, and the countdown it reads out. */
interface SlotCard {
  readonly v: RaidSlotView;
  /** `time.lastSeen` when this view was taken (the day of «завтра»). */
  readonly now: number;
  /** `countdownShown(leftSec)` of a running slot, else null. */
  readonly shown: number | null;
}

/** Whether a card would show the same: a running slot by its countdown text, not by its every tick. */
function sameCard(a: RaidSlotView, b: RaidSlotView): boolean {
  if (a.kind === 'running' && b.kind === 'running')
    return (
      countdownShown(a.leftSec) === countdownShown(b.leftSec) &&
      a.slot === b.slot &&
      a.tier === b.tier &&
      a.region === b.region &&
      a.returnAt === b.returnAt
    );
  return sameView(a, b);
}

/**
 * The slots' cards at the store's clock. Pure in the state (the same state gives equal cards); it reuses the previous
 * card object of every slot that would show the same, and the previous array when none changed — so `useGame` keeps
 * the snapshot and only the changed card's `memo` re-renders.
 */
function useSlotCards(): readonly SlotCard[] {
  const last = useRef<readonly SlotCard[]>([]);
  const select = useCallback((s: GameState): readonly SlotCard[] => {
    const now = s.time.lastSeen;
    const prev = last.current;
    const next = raidSlotsView(s, now).map((v, i): SlotCard => {
      const old = prev[i];
      if (old && sameCard(old.v, v)) return old;
      return { v, now, shown: v.kind === 'running' ? countdownShown(v.leftSec) : null };
    });
    const out = next.length === prev.length && next.every((c, i) => c === prev[i]) ? prev : next;
    last.current = out;
    return out;
  }, []);
  return useGame(select, Object.is);
}

const selectPower = (s: GameState): number => Math.floor(raidPower(s));
const selectTz = (s: GameState): number => s.settings.tzOffsetMin;
const selectRelics = (s: GameState): readonly RelicView[] => relicsView(s).filter((r) => r.found);
const sameRelics = (a: readonly RelicView[], b: readonly RelicView[]): boolean =>
  a.length === b.length &&
  a.every((x, i) => {
    const y = b[i];
    return y !== undefined && x.id === y.id && x.value === y.value;
  });

const where = raidWhere;
const slotName = (text: Text, slot: number): string => text.t('ui.raids.slot', { n: slot + 1 });

interface CardProps {
  readonly card: SlotCard;
  readonly onChoose: ((slot: number) => void) | undefined;
  /** A button of this card was pressed while it had the focus (the card may take that button away). */
  readonly onOwnPress: (button: HTMLElement) => void;
  /** Lit for a moment after a raid quest was tapped on the strip (M3-15); `current` = aria-current. */
  readonly lit: boolean;
  readonly current: boolean;
}

const Card = memo(function Card({ card, onChoose, onOwnPress, lit, current }: CardProps) {
  const { v, now } = card;
  const text = useText();
  const act = useAct();
  const tz = useGame(selectTz);
  const titleId = useId();
  const noteId = useId();
  const n = v.slot + 1;
  const title = slotName(text, v.slot);

  let body;
  if (v.kind === 'idle') {
    const note = v.blocked === 'power' ? text.t('ui.raids.noPower') : null;
    body = (
      <>
        <div className={styles.text}>
          <p className={styles.line}>
            <span id={titleId} className={styles.name}>
              {title}
            </span>
            <span className={styles.status}>
              <span className={styles.dotSep} aria-hidden="true">
                ·
              </span>
              <span className={styles.quiet}>{text.t('ui.raids.idle')}</span>
            </span>
          </p>
          {note !== null && (
            <p id={noteId} className={styles.note}>
              {note}
            </p>
          )}
        </div>
        {onChoose && (
          <button
            type="button"
            className={styles.button}
            disabled={note !== null}
            aria-label={text.t('ui.raids.chooseLabel', { n })}
            aria-describedby={note !== null ? noteId : undefined}
            onClick={() => {
              onChoose(v.slot);
            }}
          >
            {text.t('ui.raids.choose')}
          </button>
        )}
      </>
    );
  } else if (v.kind === 'running') {
    const pct = Math.min(PERCENT, Math.floor(v.progress * PERCENT));
    // A custom property is no CSSProperties key: React passes it through as is.
    const road = { '--p': String(v.progress) } as CSSProperties;
    body = (
      <div className={styles.text}>
        <p className={styles.head}>
          <span id={titleId} className={styles.name}>
            {title}
          </span>
          <span className={styles.left}>
            {text.t('ui.raids.left', { time: formatCountdown(text.lang, v.leftSec) })}
          </span>
        </p>
        <p className={styles.where}>{where(text, v.tier, v.region)}</p>
        <p className={styles.quiet}>{formatReturnAt(text.lang, v.returnAt, now, tz)}</p>
        <div
          className={styles.bar}
          role="progressbar"
          aria-label={text.t('ui.raids.road')}
          aria-valuemin={0}
          aria-valuemax={PERCENT}
          aria-valuenow={pct}
          style={road}
        >
          <span className={styles.fill} />
        </div>
      </div>
    );
  } else {
    const again = v.again === 'power' ? text.t('ui.raids.againPower') : null;
    const own = (button: HTMLElement): void => {
      if (document.activeElement === button) onOwnPress(button);
    };
    body = (
      <>
        <div className={styles.text}>
          <p className={styles.head}>
            <span id={titleId} className={styles.name}>
              {title}
            </span>
          </p>
          <p className={styles.where}>{where(text, v.tier, v.region)}</p>
          <p className={styles.back}>
            <Icon id="cossack" />
            {text.t('ui.raids.returned')}
          </p>
          {again !== null && (
            <p id={noteId} className={styles.note}>
              {again}
            </p>
          )}
        </div>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.button}
            aria-label={text.t('ui.raids.claimLabel', { n })}
            onClick={(e) => {
              own(e.currentTarget);
              act({ type: 'claimRaid', slot: v.slot });
            }}
          >
            {text.t('ui.raids.claim')}
          </button>
          <button
            type="button"
            className={[styles.button, styles.second].join(' ')}
            disabled={again !== null}
            aria-label={text.t('ui.raids.againLabel', {
              tier: tierName(text, v.tier),
              time: text.dur(raidTier(v.tier).durationSec),
            })}
            aria-describedby={again !== null ? noteId : undefined}
            onClick={(e) => {
              own(e.currentTarget);
              act({ type: 'claimRaid', slot: v.slot, again: true });
            }}
          >
            {text.t('ui.raids.again')}
          </button>
        </div>
      </>
    );
  }
  return (
    <li
      className={lit ? [styles.card, styles.lit].join(' ') : styles.card}
      data-slot={v.kind}
      data-target={`raid.${String(v.slot)}`}
      aria-labelledby={titleId}
      aria-current={current ? 'true' : undefined}
    >
      {body}
    </li>
  );
});

/** What a claim brought, in words: «Отримано: +500 дук., +50 слави, реліквія «Пернач»». */
function claimedText(text: Text, e: Extract<GameEvent, { type: 'RaidClaimed' }>): string {
  return text.t('ui.raids.saidClaimed', { loot: lootText(text, e.granted, e.relic) });
}

/**
 * The read-out: a slot that set off or came back, a claim's loot and a refused «Ще раз» — each once, when it happens
 * (not on mount, not per second). An action's events arrive during its dispatch; their words wait for the re-render the
 * action causes.
 */
function useRaidNews(cards: readonly SlotCard[]): { readonly id: number; readonly text: string } | null {
  const text = useText();
  const [said, setSaid] = useState<{ readonly id: number; readonly text: string } | null>(null);
  const pending = useRef<string[]>([]);
  useGameEvent(
    useCallback(
      (e: GameEvent) => {
        if (e.type === 'RaidClaimed') pending.current.push(claimedText(text, e));
        if (e.type === 'RaidAgainRefused')
          pending.current.push(text.t(e.reason === 'power' ? 'ui.raids.saidAgainPower' : 'ui.raids.saidAgainOff'));
      },
      [text],
    ),
  );
  const before = useRef(cards);
  useEffect(() => {
    const prev = before.current;
    before.current = cards;
    if (prev === cards) return;
    const lines = [...pending.current];
    pending.current = [];
    for (const { v } of cards) {
      const was = prev.find((x) => x.v.slot === v.slot)?.v.kind;
      if (was === undefined || was === v.kind) continue;
      const params = (tier: RaidTierId, region: RegionId) => ({ n: v.slot + 1, where: where(text, tier, region) });
      if (v.kind === 'running') lines.push(text.t('ui.raids.saidOff', params(v.tier, v.region)));
      if (v.kind === 'returned' && was === 'running') lines.push(text.t('ui.raids.saidBack', params(v.tier, v.region)));
    }
    if (lines.length > 0) setSaid((p) => ({ id: (p?.id ?? 0) + 1, text: lines.join(' ') }));
  }, [cards, text]);
  return said;
}

export interface RaidsBlockProps {
  /** «Обрати похід» for `slot`: open the raid map (M3-11). Absent: the idle cards have no button. */
  readonly onChoose?: ((slot: number) => void) | undefined;
  /** The slot whose card a raid quest tap lit (M3-15) and the one that is current (aria-current); null: none. */
  readonly lit?: number | null;
  readonly current?: number | null;
}

export function RaidsBlock({ onChoose, lit = null, current = null }: RaidsBlockProps) {
  const text = useText();
  const act = useAct();
  const headingId = useId();
  const ref = useRef<HTMLElement>(null);
  const cards = useSlotCards();
  const power = useGame(selectPower);
  const relics = useGame(selectRelics, sameRelics);
  const said = useRaidNews(cards);
  const returned = cards.filter((c) => c.v.kind === 'returned').length;

  // The player's own press took its focused button away (a claim, «Ще раз», «Забрати все»): the focus stays in the
  // block, without a scroll. A raid that comes back by itself never moves the focus.
  const refocus = useRef(false);
  const onOwnPress = useCallback(() => {
    refocus.current = true;
  }, []);
  useEffect(() => {
    if (!refocus.current) return;
    refocus.current = false;
    const active = document.activeElement;
    if (active === null || active === document.body || !active.isConnected) ref.current?.focus({ preventScroll: true });
  }, [cards]);

  return (
    <section ref={ref} className={styles.block} aria-labelledby={headingId} tabIndex={-1}>
      {/* One line where it fits: the title, the army's power and the found relics (Q10). */}
      <div className={styles.top}>
        <h2 id={headingId} className={styles.heading}>
          {text.t('ui.raids.title')}
        </h2>
        <p className={styles.power}>
          <Icon id="cossack" />
          {text.t('ui.raids.power', { value: text.num(power) })}
        </p>
        {relics.length > 0 && (
          <ul className={styles.relics} aria-label={text.t('ui.raids.relics')}>
            {relics.map((r) => {
              const name = text.t(r.nameKey);
              return (
                <li
                  key={r.id}
                  className={styles.relic}
                  aria-label={text.t('ui.raids.relicLabel', { name, effect: text.t(r.textKey, { value: r.value }) })}
                >
                  <Icon id={r.id} />
                  {name}
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {returned >= 2 && (
        <div className={styles.all}>
          <button
            type="button"
            className={styles.button}
            aria-label={text.t('ui.raids.claimAllLabel', { count: returned })}
            onClick={(e) => {
              if (document.activeElement === e.currentTarget) onOwnPress();
              act({ type: 'claimAllRaids' });
            }}
          >
            {text.t('ui.raids.claimAll', { count: returned })}
          </button>
        </div>
      )}
      <ul className={styles.cards} aria-label={text.t('ui.raids.slots')}>
        {cards.map((c) => (
          <Card
            key={c.v.slot}
            card={c}
            onChoose={onChoose}
            onOwnPress={onOwnPress}
            lit={c.v.slot === lit}
            current={c.v.slot === current}
          />
        ))}
      </ul>
      <p className={styles.said} role="status">
        {said && <span key={said.id}>{said.text}</span>}
      </p>
    </section>
  );
}
