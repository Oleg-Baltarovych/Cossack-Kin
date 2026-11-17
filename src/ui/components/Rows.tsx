// Building rows (SPEC §6.1; plan M1-17): what a level costs, what it gives, and — when the button is off — why.
// Each row reads only its own view, so a tick that changes the ducats re-renders a row only when its price,
// affordability or income did change. Names, prices and reasons all come from the core's selectors.
import { memo, useCallback, useId, type ReactNode } from 'react';
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
}

function Row({ name, level, info, note, locked = false, price, buyLabel, disabled, onBuy }: RowProps) {
  const noteId = useId();
  return (
    <li className={styles.row}>
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

export const FarmRow = memo(function FarmRow({ id, mode }: { id: FarmBuildingId; mode: BuyMode }) {
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
              ? text.t('ui.row.incomeTop', { now: text.num(v.incomeNow) })
              : text.t('ui.row.income', { now: text.num(v.incomeNow), after: text.num(v.incomeAfter) })}
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
    />
  );
});

export const SichRow = memo(function SichRow({ id, mode }: { id: SichBuildingId; mode: BuyMode }) {
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
