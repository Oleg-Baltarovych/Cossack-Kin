// Building rows (SPEC §6.1; plan M1-17): what a level costs, what it gives, and — when the button is off — why.
// Each row reads only its own view, so a tick that changes the ducats re-renders a row only when its price,
// affordability or income did change. Names, prices and reasons all come from the core's selectors.
import { Fragment, memo, useCallback, useId, type ReactNode } from 'react';
import type { SichBuildingId, SichUnlock } from '../../content/sich.ts';
import type { FarmBuildingId } from '../../content/villages/khortytsia.ts';
import type { BuyMode } from '../../core/economy.ts';
import { farmRowView, hireView, sichRowView, type BuyBlock } from '../../core/selectors.ts';
import type { GameState } from '../../core/state.ts';
import { sameView, useAct, useGame } from '../hooks/useGame.ts';
import { useHop } from '../hooks/useHop.ts';
import { useText, type Text } from '../hooks/useText.ts';
import type { Big } from '../../core/big.ts';
import type { UiIconId } from '../icons.ts';
import { Icon } from './Icon.tsx';
import styles from './Rows.module.css';

function blockText(text: Text, blocked: Exclude<BuyBlock, 'locked'> | 'kharch'): string | null {
  return blocked === null ? null : text.t(`ui.block.${blocked}`);
}

/** The icon of what is short (ADR 014: a shortage is crimson with its icon, never by colour alone); none otherwise. */
const SHORT_ICON: Readonly<Partial<Record<NonNullable<BuyBlock> | 'kharch', UiIconId>>> = {
  ducats: 'ducat',
  glory: 'glory',
  kharch: 'kharch',
};

function unlockText(text: Text, u: SichUnlock): string | null {
  switch (u.kind) {
    case 'start':
      return null;
    case 'farmAll':
      return text.t('ui.unlock.farmAll', { level: u.level });
    case 'land':
      return text.t('ui.unlock.land', { land: u.land });
  }
}

/** A button's price: the currency's icon and the compact number on one line (plan M2-14); `null` = nothing to buy. */
function priceTag(text: Text, icon: 'ducat' | 'glory', value: Big | null): ReactNode {
  if (value === null) return text.t('ui.price.none');
  return (
    <span className={styles.price}>
      <Icon id={icon} fallback={text.t(icon === 'ducat' ? 'ui.price.ducatsAbbr' : 'ui.price.gloryAbbr')} />
      <span>{text.short(value)}</span>
    </span>
  );
}

/** Placeholders a template's params are filled with, then swapped for whole tokens (private-use marks, never text). */
const SLOT = ['\u{E000}0\u{E000}', '\u{E000}1\u{E000}'] as const;
const SLOT_SPLIT = /\u{E000}(\d)\u{E000}/u;

/** «+5,88 тис./с» as one unbreakable token: a narrow row must not leave the unit alone on the next line. */
function rate(text: Text, value: Parameters<Text['num']>[0]): ReactNode {
  return <span className={styles.rate}>{text.t('ui.hud.perSec', { value: text.num(value) })}</span>;
}

/** `template` with its SLOT placeholders replaced by `nodes` (the word order stays the translation's). */
function withSlots(template: string, nodes: readonly ReactNode[]): ReactNode {
  return template
    .split(SLOT_SPLIT)
    .map((part, i) => <Fragment key={i}>{i % 2 === 1 ? nodes[Number(part)] : part}</Fragment>);
}

interface RowProps {
  readonly name: string;
  readonly level: string;
  readonly info: ReactNode;
  readonly note: string | null;
  /** A locked building: its note is the unlock condition, set apart from «not enough». */
  readonly locked?: boolean;
  /** Why the button is off, when it is a shortage: the missing currency's icon before the note. */
  readonly short?: UiIconId | undefined;
  /** The button's face (icon + compact number); its accessible name is `buyLabel`. */
  readonly price: ReactNode;
  readonly buyLabel: string;
  readonly disabled: boolean;
  /** The buy mode the price is for: a switch of mode that enables the button is no «became affordable» hop. */
  readonly mode: BuyMode;
  readonly onBuy: () => void;
  /** The building id (the bottom sheet scrolls to `data-building` when its plot is tapped, M2-13). */
  readonly building?: string;
  /** What a reveal scrolls to (`data-target`, M3-15): the building id, `hire`. */
  readonly target?: string;
  /** Lit for a moment after its building was tapped in the world (or its quest on the strip, M3-15). */
  readonly highlighted?: boolean;
  /** The row of the building just tapped (aria-current), until the player does something else in the sheet. */
  readonly current?: boolean;
}

function Row({
  name,
  level,
  info,
  note,
  locked = false,
  short,
  price,
  buyLabel,
  disabled,
  mode,
  onBuy,
  building,
  target,
  highlighted = false,
  current = false,
}: RowProps) {
  const noteId = useId();
  const hop = useHop<HTMLButtonElement>(!disabled, mode);
  return (
    <li
      className={highlighted ? [styles.row, styles.lit].join(' ') : styles.row}
      data-building={building}
      data-target={target}
      aria-current={current ? 'true' : undefined}
    >
      <div className={styles.text}>
        <p className={styles.head}>
          <span className={styles.name}>{name}</span>
          <span className={styles.level}>{level}</span>
        </p>
        <div className={styles.info}>{info}</div>
        {note !== null && (
          <p id={noteId} className={locked ? styles.locked : short ? styles.short : styles.note}>
            {locked && <Icon id="lock" />}
            {!locked && short && <Icon id={short} />}
            {note}
          </p>
        )}
      </div>
      <button
        ref={hop}
        type="button"
        className={styles.buy}
        disabled={disabled}
        aria-label={buyLabel}
        aria-describedby={note !== null ? noteId : undefined}
        onClick={onBuy}
      >
        {price}
      </button>
    </li>
  );
}

interface BuildingRowProps<Id> {
  readonly id: Id;
  readonly mode: BuyMode;
  readonly highlighted?: boolean;
  readonly current?: boolean;
}

export const FarmRow = memo(function FarmRow({
  id,
  mode,
  highlighted = false,
  current = false,
}: BuildingRowProps<FarmBuildingId>) {
  const select = useCallback((s: GameState) => farmRowView(s, id, mode), [id, mode]);
  const v = useGame(select, sameView);
  const act = useAct();
  const text = useText();
  const name = text.t(v.nameKey);
  const top = v.blocked === 'max';
  const price = top ? text.t('ui.price.none') : text.t('ui.price.ducats', { value: text.num(v.price) });
  return (
    <Row
      name={name}
      level={text.t('ui.row.level', { level: v.level })}
      info={
        <>
          <span className={styles.income}>
            {top
              ? withSlots(text.t('ui.row.incomeTop', { now: SLOT[0] }), [rate(text, v.incomeNow)])
              : withSlots(text.t('ui.row.income', { now: SLOT[0], after: SLOT[1] }), [
                  rate(text, v.incomeNow),
                  rate(text, v.incomeAfter),
                ])}
          </span>
          {v.nextMilestone && (
            <span className={styles.milestone}>
              {text.t('ui.row.milestone', { mult: v.nextMilestone.mult, level: v.nextMilestone.level })}
            </span>
          )}
        </>
      }
      note={blockText(text, v.blocked)}
      short={v.blocked === null ? undefined : SHORT_ICON[v.blocked]}
      price={priceTag(text, 'ducat', top ? null : v.price)}
      buyLabel={text.t('ui.row.buy', { count: v.count, name, price })}
      disabled={v.blocked !== null}
      mode={mode}
      onBuy={() => {
        act({ type: 'buyBuilding', id, mode });
      }}
      building={id}
      target={id}
      highlighted={highlighted}
      current={current}
    />
  );
});

export const SichRow = memo(function SichRow({
  id,
  mode,
  highlighted = false,
  current = false,
}: BuildingRowProps<SichBuildingId>) {
  const select = useCallback((s: GameState) => sichRowView(s, id, mode), [id, mode]);
  const v = useGame(select, sameView);
  const act = useAct();
  const text = useText();
  const name = text.t(v.nameKey);
  const top = v.blocked === 'max';
  const price = top ? text.t('ui.price.none') : text.t('ui.price.glory', { value: text.num(v.price) });
  return (
    <Row
      name={name}
      level={text.t('ui.row.level', { level: v.level })}
      info={<span className={styles.desc}>{text.t(v.descKey)}</span>}
      note={v.blocked === 'locked' ? unlockText(text, v.unlock) : blockText(text, v.blocked)}
      short={v.blocked === null ? undefined : SHORT_ICON[v.blocked]}
      locked={v.blocked === 'locked'}
      price={priceTag(text, 'glory', top ? null : v.price)}
      buyLabel={text.t('ui.row.buy', { count: v.count, name, price })}
      disabled={v.blocked !== null}
      mode={mode}
      onBuy={() => {
        act({ type: 'buySich', id, mode });
      }}
      building={id}
      target={id}
      highlighted={highlighted}
      current={current}
    />
  );
});

/**
 * The hire row (plan M2-14): the shared ×1/×10/×25/Max picker applies — the selector says how many the button hires
 * and for how much, and the button sends exactly that count (enabled ⇔ the reducer accepts it, tested on selectors).
 */
export const HireRow = memo(function HireRow({
  mode,
  highlighted = false,
  current = false,
}: {
  readonly mode: BuyMode;
  /** Lit for a moment after a hire quest was tapped on the strip (M3-15). */
  readonly highlighted?: boolean;
  readonly current?: boolean;
}) {
  const select = useCallback((s: GameState) => hireView(s, mode), [mode]);
  const v = useGame(select, sameView);
  const act = useAct();
  const text = useText();
  const full = v.blocked === 'kharch';
  const price = full ? text.t('ui.price.none') : text.t('ui.price.ducats', { value: text.num(v.price) });
  return (
    <Row
      name={text.t('ui.hire.name')}
      level={text.t('ui.hire.level', { count: v.cossacks, max: v.maxCossacks })}
      info={
        <>
          <span className={styles.desc}>{text.t('ui.hire.desc', { kharch: v.kharchPerCossack })}</span>
          {!full && <span className={styles.count}>{text.t('ui.hire.count', { count: v.count })}</span>}
        </>
      }
      note={blockText(text, v.blocked)}
      short={v.blocked === null ? undefined : SHORT_ICON[v.blocked]}
      price={priceTag(text, 'ducat', full ? null : v.price)}
      buyLabel={full ? text.t('ui.hire.buttonFull') : text.t('ui.hire.button', { count: v.count, price })}
      disabled={v.blocked !== null}
      mode={mode}
      onBuy={() => {
        act({ type: 'hire', n: v.count });
      }}
      target="hire"
      highlighted={highlighted}
      current={current}
    />
  );
});
