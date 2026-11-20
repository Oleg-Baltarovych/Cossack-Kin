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
import { useText, type Text } from '../hooks/useText.ts';
import styles from './Rows.module.css';

function blockText(text: Text, blocked: Exclude<BuyBlock, 'locked'> | 'kharch'): string | null {
  return blocked === null ? null : text.t(`ui.block.${blocked}`);
}

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
  readonly price: string;
  readonly buyLabel: string;
  readonly disabled: boolean;
  readonly onBuy: () => void;
  /** The building id (the bottom sheet scrolls to `data-building` when its plot is tapped, M2-13). */
  readonly building?: string;
  /** Lit for a moment after its building was tapped in the world. */
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
  price,
  buyLabel,
  disabled,
  onBuy,
  building,
  highlighted = false,
  current = false,
}: RowProps) {
  const noteId = useId();
  return (
    <li
      className={highlighted ? [styles.row, styles.lit].join(' ') : styles.row}
      data-building={building}
      aria-current={current ? 'true' : undefined}
    >
      <div className={styles.text}>
        <p className={styles.head}>
          <span className={styles.name}>{name}</span>
          <span className={styles.level}>{level}</span>
        </p>
        <div className={styles.info}>{info}</div>
        {note !== null && (
          <p id={noteId} className={locked ? styles.locked : styles.note}>
            {note}
          </p>
        )}
      </div>
      <button
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
      price={price}
      buyLabel={text.t('ui.row.buy', { count: v.count, name, price })}
      disabled={v.blocked !== null}
      onBuy={() => {
        act({ type: 'buyBuilding', id, mode });
      }}
      building={id}
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
      locked={v.blocked === 'locked'}
      price={price}
      buyLabel={text.t('ui.row.buy', { count: v.count, name, price })}
      disabled={v.blocked !== null}
      onBuy={() => {
        act({ type: 'buySich', id, mode });
      }}
      building={id}
      highlighted={highlighted}
      current={current}
    />
  );
});

/** Hiring goes one Cossack at a time in M1: the buy-amount picker does not apply, and the row says so. */
export const HireRow = memo(function HireRow() {
  const v = useGame(hireView, sameView);
  const act = useAct();
  const text = useText();
  const price = text.t('ui.price.ducats', { value: text.num(v.price) });
  return (
    <Row
      name={text.t('ui.hire.name')}
      level={text.t('ui.hud.cossacks', { count: v.cossacks, max: v.maxCossacks })}
      info={<span className={styles.desc}>{text.t('ui.hire.desc', { kharch: v.kharchPerCossack })}</span>}
      note={blockText(text, v.blocked)}
      price={price}
      buyLabel={text.t('ui.hire.button', { price })}
      disabled={v.blocked !== null}
      onBuy={() => {
        act({ type: 'hire', n: 1 });
      }}
    />
  );
});
