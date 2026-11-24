// The raid's chest (plan M3-12, SPEC §6.7, §0.1 П4/П11/П12): the window a claim opens. The core granted the loot at
// «Забрати» (`RaidClaimed`); this only shows it — the chest shakes (RAID_REVEAL.shakeMs), opens, and what it held comes
// out one piece at a time, a relic as its own beat with its name, its bonus and a fact (§16). The result is hidden until
// the chest opens (the title is neutral; the outcome line comes with the first item). A tap anywhere in the window, or
// Enter/Space, shows everything at once; «Забрати» closes it from the first frame — the window never blocks. One
// window for all claims of one action («Забрати все», Q17): a section per squad. A failure says why it brought less
// («повернулися з частиною здобичі», П11) — never by colour alone. On close the ducats and the glory fly to their HUD
// counters (CoinFlight). «Менше руху»: the finished list at once — no shake, no coins.
// Accessibility: a dialog named by its title, described by the whole loot in words from the first frame (a screen
// reader never waits for the show); items not shown yet are hidden from it too. Tab stays inside, Esc closes like the
// button, GameUi gives the focus back after the last window.
import { useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties } from 'react';
import { RAID_REVEAL } from '../../content/juice.ts';
import type { RelicId } from '../../content/relics.ts';
import { Big } from '../../core/big.ts';
import { relicsView, type RelicView } from '../../core/raid-selectors.ts';
import type { GameState } from '../../core/state.ts';
import { trapTab } from '../hooks/useDialogFocus.ts';
import { useGame } from '../hooks/useGame.ts';
import { useText, type Text } from '../hooks/useText.ts';
import type { IconId } from '../icons.ts';
import { lessMotion } from '../motion.ts';
import { chestItems, revealTimes, type ChestClaim, type ChestItem, type ChestWindow } from '../raidReveal.ts';
import { lootText, raidWhere } from '../raidText.ts';
import { grantedText } from '../rewards.ts';
import { useCoinLaunch } from './CoinFlight.tsx';
import { Icon } from './Icon.tsx';
import styles from './RaidChest.module.css';

export interface RaidChestProps {
  readonly chest: ChestWindow;
  readonly onClose: () => void;
}

const ITEM_ICON: Readonly<Record<'ducats' | 'glory' | 'pysanky', IconId>> = {
  ducats: 'ducat',
  glory: 'glory',
  pysanky: 'pysanka',
};

/** The relics as the collection shows them (their bonus in whole percent comes from the core). */
const selectRelics = (s: GameState): readonly RelicView[] => relicsView(s);
const sameRelics = (a: readonly RelicView[], b: readonly RelicView[]): boolean =>
  a.length === b.length && a.every((x, i) => x.id === b[i]?.id && x.value === b[i].value);

const squadLine = (text: Text, c: ChestClaim): string =>
  text.t('ui.chest.squad', { n: c.slot + 1, where: raidWhere(text, c.tier, c.region) });
const outcome = (text: Text, c: ChestClaim): string => text.t(c.success ? 'ui.chest.won' : 'ui.chest.lost');

function itemText(text: Text, item: ChestItem): string {
  switch (item.kind) {
    case 'ducats':
    case 'glory':
      return grantedText(text, { currency: item.kind, amount: item.amount });
    case 'pysanky':
      return grantedText(text, { currency: 'pysanky', amount: item.n });
    case 'relic':
      return '';
  }
}

function RelicCard({
  id,
  relic,
  shown,
  still,
}: {
  id: RelicId;
  relic: RelicView | undefined;
  shown: boolean;
  still: boolean;
}) {
  const text = useText();
  const ref = useRef<HTMLDivElement>(null);
  // Its own beat: the card is brought into the window's view when it appears (it may sit below the fold of a
  // long «Забрати все»); at once under «менше руху».
  useEffect(() => {
    if (shown) ref.current?.scrollIntoView({ block: 'nearest', behavior: still ? 'auto' : 'smooth' });
  }, [shown, still]);
  return (
    <div ref={ref} className={styles.relic} data-item="relic" data-shown={shown ? '' : undefined} aria-hidden={!shown}>
      {/* The picture beside the heading; the name and the words take the card's whole width (larger text). */}
      <Icon id={id} big />
      <p className={styles.relicHead}>{text.t('ui.chest.relic')}</p>
      {/* `relicsView` lists every relic of the content, so a granted id always has its view. */}
      {relic && (
        <div className={styles.relicText}>
          <p className={styles.relicName}>{text.t(relic.nameKey)}</p>
          <p>{text.t(relic.textKey, { value: relic.value })}</p>
          <p className={styles.fact}>{text.t(relic.factKey)}</p>
        </div>
      )}
    </div>
  );
}

export function RaidChest({ chest, onClose }: RaidChestProps) {
  const text = useText();
  const { t } = text;
  const titleId = useId();
  const summaryId = useId();
  const boxRef = useRef<HTMLElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const relics = useGame(selectRelics, sameRelics);
  const launch = useCoinLaunch();

  const items = useMemo(() => chestItems(chest.claims), [chest]);
  const times = useMemo(() => revealTimes(items), [items]);
  // «Менше руху» is read once, when the window opens: the finished list, no shake.
  const [still] = useState(() => lessMotion());
  const [open, setOpen] = useState(still);
  const [shown, setShown] = useState(still ? items.length : 0);
  const done = open && shown >= items.length;

  useEffect(() => {
    if (still) return undefined;
    const timers = [
      setTimeout(() => {
        setOpen(true);
      }, RAID_REVEAL.shakeMs),
      ...times.map((at, i) =>
        setTimeout(() => {
          setShown((n) => Math.max(n, i + 1));
        }, at),
      ),
    ];
    return () => {
      for (const x of timers) clearTimeout(x);
    };
  }, [still, times]);
  const showAll = useCallback(() => {
    setOpen(true);
    setShown(items.length);
  }, [items.length]);

  // Closing (the button or Esc) sends the ducats and the glory to their counters, if large (CoinFlight decides).
  const latest = useRef({ onClose, launch, claims: chest.claims });
  useEffect(() => {
    latest.current = { onClose, launch, claims: chest.claims };
  });
  const close = useCallback(() => {
    const l = latest.current;
    const sum = (pick: (c: ChestClaim) => Big): Big => l.claims.reduce((a, c) => a.add(pick(c)), Big.ZERO);
    l.launch(buttonRef.current, { currency: 'ducats', amount: sum((c) => c.granted.ducats) });
    l.launch(buttonRef.current, { currency: 'glory', amount: sum((c) => c.granted.glory) });
    l.onClose();
  }, []);
  // The only control: focused at once (a passive effect, after GameUi noted the opener).
  useEffect(() => {
    buttonRef.current?.focus();
  }, []);
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent): void => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      e.preventDefault();
      close();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [close]);

  const many = chest.claims.length > 1;
  const summary = chest.claims
    .map((c) =>
      t('ui.chest.said', {
        squad: squadLine(text, c),
        outcome: outcome(text, c),
        loot: lootText(text, c.granted, c.relic),
      }),
    )
    .join(' ');
  // Custom properties are not CSSProperties keys; React passes them through as they are.
  const shake = {
    '--shake-px': String(RAID_REVEAL.shakePx),
    '--shake-step': `${String(RAID_REVEAL.shakeStepMs)}ms`,
    '--shake-n': String(RAID_REVEAL.shakeCycles),
  } as CSSProperties;
  return (
    <div
      className={styles.backdrop}
      // A tap anywhere — the window or the dim around it — shows everything; «Забрати» only closes. The keyboard
      // has the same through the dialog's onKeyDown.
      onClick={(e) => {
        const button = buttonRef.current;
        const target = e.target;
        if (!button || (target instanceof Node && button.contains(target))) return;
        if (!done) showAll();
        // A press on plain text leaves the focus on the page: «Забрати» takes it back (Enter then closes).
        if (document.activeElement !== button) button.focus({ preventScroll: true });
      }}
    >
      <section
        ref={boxRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={summaryId}
        data-reveal={done ? 'done' : open ? 'items' : 'shake'}
        onKeyDown={(e) => {
          // Enter/Space on «Забрати» are the button's own (it closes at once); anywhere else they show everything.
          const onButton = e.target instanceof Node && buttonRef.current?.contains(e.target) === true;
          if (!done && !onButton && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            showAll();
            return;
          }
          if (boxRef.current) trapTab(e, boxRef.current);
        }}
      >
        <h2 id={titleId} className={styles.title}>
          {many ? t('ui.chest.title.many', { count: chest.claims.length }) : t('ui.chest.title')}
        </h2>
        <p id={summaryId} className={styles.sr}>
          {summary}
        </p>
        <div className={styles.body}>
          <div className={styles.chest} data-phase={open ? 'open' : 'shake'} style={shake} aria-hidden="true">
            <Icon id={open ? 'chest-open' : 'chest'} big />
          </div>
          {!done && (
            <p className={styles.skip} aria-hidden="true">
              {t('ui.chest.skip')}
            </p>
          )}
          {chest.claims.map((c, ci) => {
            const own = items.flatMap((item, i) => (item.claim === ci ? [{ item, i }] : []));
            const first = own[0]?.i ?? 0;
            // A claim with nothing to list still tells its outcome once the chest is open.
            const told = open && (own.length === 0 || shown > first);
            const lines = own.filter(({ item }) => item.kind !== 'relic');
            return (
              <section key={c.slot} className={styles.squad} data-claim={ci} aria-label={squadLine(text, c)}>
                <p className={styles.squadLine}>{squadLine(text, c)}</p>
                <p
                  className={c.success ? styles.won : styles.lost}
                  data-shown={told ? '' : undefined}
                  aria-hidden={!told}
                >
                  {outcome(text, c)}
                </p>
                {lines.length > 0 && (
                  <ul className={styles.items} aria-label={t('ui.chest.loot')}>
                    {lines.map(({ item, i }) =>
                      item.kind === 'relic' ? null : (
                        <li
                          key={item.kind}
                          className={styles.item}
                          data-item={item.kind}
                          data-shown={i < shown ? '' : undefined}
                          aria-hidden={i >= shown}
                        >
                          <Icon id={ITEM_ICON[item.kind]} />
                          <span>{itemText(text, item)}</span>
                        </li>
                      ),
                    )}
                  </ul>
                )}
                {own.map(({ item, i }) =>
                  item.kind === 'relic' ? (
                    <RelicCard
                      key="relic"
                      id={item.id}
                      relic={relics.find((r) => r.id === item.id)}
                      shown={i < shown}
                      still={still}
                    />
                  ) : null,
                )}
              </section>
            );
          })}
        </div>
        <button ref={buttonRef} type="button" className={styles.claim} onClick={close}>
          {t('ui.chest.claim')}
        </button>
      </section>
    </div>
  );
}
