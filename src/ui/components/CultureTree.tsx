// The culture branches as trees and the node card (plan M4-13, SPEC §10.3, §0.1 П1/П4): each branch root → 2 → 2 →
// top with its prerequisite lines in whole logical px, the whole tree shown from the start (a closed branch with its
// condition, closed nodes with their effect). A node says its ranks and state in words and an icon, never by colour
// alone. A tap (Enter/Space) opens its card, sticky at the bottom of the tab: ranks, each effect «зараз → після» with
// the absolute number, the fact (SPEC §16), «Вивчити» — one rank a press (the shared picker is the heroes') — or the
// reason it is off (`aria-describedby`). One tab stop for the tree; the arrows move along it (`treeStep`). Every
// number is `cultureView`'s.
import { Fragment, memo, useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { CULTURE_NODES, type CultureNodeId } from '../../content/culture.ts';
import {
  cultureView,
  type CultureBlock,
  type CultureBranchView,
  type CultureNodeView,
  type CultureView,
} from '../../core/culture-selectors.ts';
import { isTreeKey, TREE_CELLS, treeStep } from '../cultureTree.ts';
import { amountLine, effectLine, sameBig, sameEffects } from '../effectText.ts';
import { useAct, useGame } from '../hooks/useGame.ts';
import { useHop } from '../hooks/useHop.ts';
import { useText, type Text } from '../hooks/useText.ts';
import { CULTURE_ICON } from '../icons.ts';
import { Icon } from './Icon.tsx';
import styles from './Culture.module.css';

const sameNode = (a: CultureNodeView, b: CultureNodeView): boolean =>
  a.id === b.id &&
  a.rank === b.rank &&
  a.blocked === b.blocked &&
  sameBig(a.price, b.price) &&
  sameEffects(a.effects, b.effects);

const sameCulture = (a: CultureView, b: CultureView): boolean =>
  a.branches.length === b.branches.length &&
  a.branches.every((x, i) => {
    const o = b.branches[i];
    return (
      o !== undefined &&
      x.id === o.id &&
      x.open === o.open &&
      x.nodes.length === o.nodes.length &&
      x.nodes.every((n, j) => o.nodes[j] !== undefined && sameNode(n, o.nodes[j]))
    );
  });

/** A node's state word: `buyCulture`'s refusal, or «open» (it can be learned now). */
type NodeState = Exclude<CultureBlock, null> | 'open';
const stateOf = (n: CultureNodeView): NodeState => n.blocked ?? 'open';

/** The icon beside a node's ranks (with its words in the label). Reachable but too dear: no icon. */
const STATE_ICON: Readonly<Record<NodeState, 'lock' | 'glory' | 'milestone' | null>> = {
  locked: 'lock',
  prereq: 'lock',
  glory: null,
  open: 'glory',
  max: 'milestone',
};

/** The icon of the reason «Вивчити» is off. */
const BLOCK_ICON = { locked: 'lock', prereq: 'lock', max: 'milestone', glory: 'glory' } as const;

const NODE_DEF = new Map(CULTURE_NODES.map((n) => [n.id, n]));
const CELL = new Map(TREE_CELLS.map((c) => [c.id, c]));

type Place = 'left' | 'right' | 'mid';

/** Where a node stands: the left or right half of its row, or the middle (the root and the top). */
const placeOf = (id: CultureNodeId): Place => {
  const col = CELL.get(id)?.col ?? null;
  return col === null ? 'mid' : col === 0 ? 'left' : 'right';
};

interface TreeNav {
  readonly focus: CultureNodeId;
  readonly open: CultureNodeId | null;
  readonly cardId: string;
  readonly onKey: (from: CultureNodeId, e: KeyboardEvent<HTMLButtonElement>) => void;
  readonly onFocus: (id: CultureNodeId) => void;
  readonly onToggle: (id: CultureNodeId) => void;
  readonly bind: (id: CultureNodeId) => (el: HTMLButtonElement | null) => void;
}

const NodeButton = memo(function NodeButton({ n, nav }: { readonly n: CultureNodeView; readonly nav: TreeNav }) {
  const { t } = useText();
  const state = stateOf(n);
  const icon = STATE_ICON[state];
  const name = t(n.nameKey);
  const open = nav.open === n.id;
  return (
    <button
      ref={nav.bind(n.id)}
      type="button"
      className={styles.node}
      data-node={n.id}
      data-state={state}
      data-place={placeOf(n.id)}
      data-learned={n.rank > 0 ? '' : undefined}
      tabIndex={nav.focus === n.id ? 0 : -1}
      aria-label={t('ui.node.label', { name, rank: n.rank, max: n.maxRank, state: t(`ui.node.state.${state}`) })}
      aria-expanded={open}
      aria-controls={open ? nav.cardId : undefined}
      onKeyDown={(e) => {
        nav.onKey(n.id, e);
      }}
      onFocus={() => {
        nav.onFocus(n.id);
      }}
      onClick={() => {
        nav.onToggle(n.id);
      }}
    >
      <span className={styles.niche}>
        <Icon id={CULTURE_ICON[n.id]} />
      </span>
      <span className={styles.nodeText}>
        <span>{name}</span>
        <span className={styles.rank}>
          {icon !== null && <Icon id={icon} />}
          <span>{t('ui.node.rank', { rank: n.rank, max: n.maxRank })}</span>
        </span>
      </span>
    </button>
  );
});

/**
 * The prerequisite lines between two rows: stubs down from the row above, a bar across, stubs down to the row below.
 * Gold once the row below may be learned; decorative — each node's words say its state.
 */
function Link({
  up,
  down,
  lit,
}: {
  readonly up: readonly Place[];
  readonly down: readonly Place[];
  readonly lit: boolean;
}) {
  return (
    <div className={styles.link} data-lit={lit ? '' : undefined} aria-hidden="true">
      {up.map((p) => (
        <span key={`u-${p}`} className={styles.stub} data-end="up" data-place={p} />
      ))}
      <span className={styles.bar} />
      {down.map((p) => (
        <span key={`d-${p}`} className={styles.stub} data-end="down" data-place={p} />
      ))}
    </div>
  );
}

/** A row may be learned: open branch and prerequisites met (a node at the max had them). */
const reachable = (row: readonly CultureNodeView[]): boolean =>
  row.some((n) => n.blocked !== 'locked' && n.blocked !== 'prereq');

const ROWS = [1, 2, 3, 4] as const;

function BranchTree({ b, nav }: { readonly b: CultureBranchView; readonly nav: TreeNav }) {
  const { t } = useText();
  const nameId = useId();
  const learned = b.nodes.filter((n) => n.rank > 0).length;
  const rows = ROWS.map((r) => b.nodes.filter((n) => n.row === r));
  return (
    <div
      role="group"
      aria-labelledby={nameId}
      className={styles.branch}
      data-branch={b.id}
      data-open={b.open ? '' : undefined}
    >
      <div className={styles.branchHead}>
        <span className={styles.niche}>
          <Icon id={CULTURE_ICON[b.id]} />
        </span>
        <div className={styles.text}>
          <p id={nameId} className={styles.name}>
            {t(b.nameKey)}
          </p>
          {b.open ? (
            <p className={styles.learned}>{t('ui.culture.learned', { count: learned, total: b.nodes.length })}</p>
          ) : (
            <p className={styles.unlock}>
              <Icon id="lock" />
              <span>{t(b.unlockKey)}</span>
            </p>
          )}
        </div>
      </div>
      <div className={styles.tree}>
        {rows.map((row, i) => (
          <Fragment key={ROWS[i]}>
            {i > 0 && (
              <Link
                up={(rows[i - 1] ?? []).map((n) => placeOf(n.id))}
                down={row.map((n) => placeOf(n.id))}
                lit={reachable(row)}
              />
            )}
            <div className={styles.row}>
              {row.map((n) => (
                <NodeButton key={n.id} n={n} nav={nav} />
              ))}
            </div>
          </Fragment>
        ))}
      </div>
    </div>
  );
}

/** Why «Вивчити» is off; for a prerequisite, the nodes it waits for («… або …», «… і …»). */
function blockText(text: Text, n: CultureNodeView, b: CultureBranchView): string {
  switch (n.blocked) {
    case 'locked':
      return text.t(b.unlockKey);
    case 'prereq': {
      if (n.requires.kind === 'root') return '';
      const names = n.requires.ids.map((id) =>
        text.t('ui.node.quote', { name: text.t(NODE_DEF.get(id)?.nameKey ?? id) }),
      );
      const list = new Intl.ListFormat(text.lang, {
        type: n.requires.kind === 'anyOf' ? 'disjunction' : 'conjunction',
      });
      return text.t('ui.node.block.prereq', { nodes: list.format(names) });
    }
    case 'max':
      return text.t('ui.node.block.max');
    case 'glory':
      return text.t('ui.block.glory');
    case null:
      return '';
  }
}

function NodeCard({
  id,
  n,
  b,
  onClose,
  onRefocus,
}: {
  readonly id: string;
  readonly n: CultureNodeView;
  readonly b: CultureBranchView;
  readonly onClose: () => void;
  readonly onRefocus: () => void;
}) {
  const text = useText();
  const { t } = text;
  const act = useAct();
  const nameId = useId();
  const noteId = useId();
  const disabled = n.blocked !== null;
  // Another node's card is not «became affordable»: the node id is the hop's mode.
  const hop = useHop<HTMLButtonElement>(!disabled, n.id);
  const pressed = useRef(false);
  // A press that turned the button off (the max, or the glory spent) would drop focus to the page: back to the node.
  useEffect(() => {
    if (disabled && pressed.current) onRefocus();
    pressed.current = false;
  }, [disabled, onRefocus]);
  const name = t(n.nameKey);
  const top = n.blocked === 'max';
  const price = n.price === null ? t('ui.price.none') : t('ui.price.glory', { value: text.num(n.price) });
  return (
    <section id={id} className={styles.nodeCard} aria-labelledby={nameId} data-card={n.id}>
      <div className={styles.cardHead}>
        <span className={styles.niche} data-learned={n.rank > 0 ? '' : undefined}>
          <Icon id={CULTURE_ICON[n.id]} />
        </span>
        <div className={styles.text}>
          <p id={nameId} className={styles.name}>
            {name}
          </p>
          <p className={styles.level}>{t('ui.node.rankLong', { rank: n.rank, max: n.maxRank })}</p>
        </div>
        <button type="button" className={styles.close} aria-label={t('ui.node.close')} onClick={onClose}>
          ×
        </button>
      </div>
      <ul className={styles.effects}>
        {n.effects.map((e) => (
          <li key={e.kind}>
            <span>{effectLine(text, e)}</span>
            {e.amount !== null && <span className={styles.amount}>{amountLine(text, e.amount)}</span>}
          </li>
        ))}
      </ul>
      <p className={styles.fact}>{t(n.factKey)}</p>
      <div className={styles.foot}>
        {n.blocked !== null && (
          <p id={noteId} className={styles.note}>
            <Icon id={BLOCK_ICON[n.blocked]} />
            <span>{blockText(text, n, b)}</span>
          </p>
        )}
        <button
          ref={hop}
          type="button"
          className={styles.buy}
          disabled={disabled}
          aria-label={top ? t('ui.node.buyTop', { name }) : t('ui.node.buy', { name, rank: n.rank + 1, price })}
          aria-describedby={n.blocked !== null ? noteId : undefined}
          onClick={() => {
            pressed.current = true;
            act({ type: 'buyCulture', id: n.id });
          }}
        >
          <span>{top ? t('ui.node.buttonTop') : t('ui.node.button')}</span>
          {n.price !== null && (
            <span className={styles.price}>
              <Icon id="glory" fallback={t('ui.price.gloryAbbr')} />
              <span>{text.short(n.price)}</span>
            </span>
          )}
        </button>
      </div>
    </section>
  );
}

const FIRST: CultureNodeId = TREE_CELLS[0]?.id ?? 'music.dumy';

export function CultureTree() {
  const { t } = useText();
  const headingId = useId();
  const cardId = useId();
  const view = useGame(cultureView, sameCulture);
  const [focus, setFocus] = useState<CultureNodeId>(FIRST);
  const [open, setOpen] = useState<CultureNodeId | null>(null);
  const buttons = useRef(new Map<CultureNodeId, HTMLButtonElement>());
  // One stable ref callback per node, so a re-render does not detach and re-attach every button.
  const binders = useRef(new Map<CultureNodeId, (el: HTMLButtonElement | null) => void>());
  const nav = useMemo<TreeNav>(
    () => ({
      focus,
      open,
      cardId,
      onKey: (from, e) => {
        if (!isTreeKey(e.key)) return;
        e.preventDefault();
        const next = treeStep(TREE_CELLS, from, e.key);
        setFocus(next);
        buttons.current.get(next)?.focus();
      },
      onFocus: setFocus,
      onToggle: (id) => {
        setOpen((o) => (o === id ? null : id));
      },
      bind: (id) => {
        let f = binders.current.get(id);
        if (f === undefined) {
          f = (el) => {
            if (el) buttons.current.set(id, el);
            else buttons.current.delete(id);
          };
          binders.current.set(id, f);
        }
        return f;
      },
    }),
    [focus, open, cardId],
  );
  const refocus = useCallback(() => {
    if (open !== null) buttons.current.get(open)?.focus();
  }, [open]);
  const close = useCallback(() => {
    if (open !== null) buttons.current.get(open)?.focus();
    setOpen(null);
  }, [open]);
  const branch = open === null ? undefined : view.branches.find((b) => b.nodes.some((n) => n.id === open));
  const node = branch?.nodes.find((n) => n.id === open);
  return (
    <>
      <section className={styles.block} aria-labelledby={headingId}>
        <h2 id={headingId} className={styles.heading}>
          {t('ui.culture.branches')}
        </h2>
        {view.branches.map((b) => (
          <BranchTree key={b.id} b={b} nav={nav} />
        ))}
      </section>
      {/* A direct child of the sheet's scroller (`CultureTab` is a fragment), so it sticks to its bottom. */}
      {node !== undefined && branch !== undefined && (
        <NodeCard id={cardId} n={node} b={branch} onClose={close} onRefocus={refocus} />
      )}
    </>
  );
}
