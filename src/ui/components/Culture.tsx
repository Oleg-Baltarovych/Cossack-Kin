// The «Культура» tab (plan M4-12, SPEC §10.3, §0.1 П5): on top the «Герої» block — a card per hero: his ×2 portrait,
// name and title, level of the cap, each effect «зараз → після» for the shared ×1/×10/×25/Max picker, and «Підвищити»
// with its price (off with the reason, `aria-describedby`, as a building row). A hero who has not come is a silhouette,
// «Невідомий гість» and when he comes (his beat's trigger from content). Below, the two branches: name, how many of
// their nodes are learned, or the lock and when the branch opens (the tree itself is M4-13). Every number is a core
// view's (`heroesView`, percents by `effectPercent`); the UI only formats.
import { memo, useCallback, useId } from 'react';
import { CULTURE_BRANCHES, CULTURE_NODES, type CultureBranchId } from '../../content/culture.ts';
import type { StoryTrigger } from '../../content/story.ts';
import type { Big } from '../../core/big.ts';
import { heroesView, type EffectPreview, type HeroBlock, type HeroView } from '../../core/culture-selectors.ts';
import type { BuyMode } from '../../core/economy.ts';
import { cultureBranchOpen } from '../../core/modifiers.ts';
import type { GameState } from '../../core/state.ts';
import { useAct, useGame } from '../hooks/useGame.ts';
import { useHop } from '../hooks/useHop.ts';
import { useText, type Text } from '../hooks/useText.ts';
import { CULTURE_ICON } from '../icons.ts';
import { Icon } from './Icon.tsx';
import { Portrait } from './Portrait.tsx';
import styles from './Culture.module.css';

/** The threshold `{n}` of a hero's «Прийде, коли…» (null: a trigger without a number). */
function triggerN(u: StoryTrigger | null): number | null {
  if (u === null) return null;
  switch (u.kind) {
    case 'building':
    case 'sich':
      return u.level;
    case 'hired':
    case 'storms':
    case 'raidsWon':
      return u.count;
    case 'start':
    case 'bloom':
      return null;
  }
}

/** A share as shown: a percent (`effectPercent` already applied by the view) or a span of seconds. */
function shareText(text: Text, e: EffectPreview, v: number): string {
  return e.unit === 'percent' ? text.num(v) : text.dur(v);
}

/** «+2 % → +4 % сили війська»; at the cap only «+50 % сили війська». */
function effectLine(text: Text, e: EffectPreview): string {
  return e.after === null
    ? text.t(e.key, { value: shareText(text, e, e.now) })
    : text.t(`${e.key}.change`, { now: shareText(text, e, e.now), after: shareText(text, e, e.after) });
}

const sameBig = (a: Big | null, b: Big | null): boolean => (a === null || b === null ? a === b : a.eq(b));

/** What a card shows changes only with these (the absolute amounts are not on the hero card). */
const sameHero = (a: HeroView, b: HeroView): boolean =>
  a.id === b.id &&
  a.level === b.level &&
  a.count === b.count &&
  a.blocked === b.blocked &&
  sameBig(a.price, b.price) &&
  a.effects.length === b.effects.length &&
  a.effects.every(
    (e, i) => e.kind === b.effects[i]?.kind && e.now === b.effects[i].now && e.after === b.effects[i].after,
  );

const sameHeroes = (a: readonly HeroView[], b: readonly HeroView[]): boolean =>
  a.length === b.length && a.every((x, i) => b[i] !== undefined && sameHero(x, b[i]));

/** A hero who came: his button can only be off for the cap or glory (`levelHero` refuses `locked` before he comes). */
type ComeHero = HeroView & { readonly blocked: Exclude<HeroBlock, 'locked'> };
const hasCome = (v: HeroView): v is ComeHero => v.blocked !== 'locked';

/** Why the button is off, with the icon that says it (not by colour alone): the cap, or not enough glory. */
const BLOCK_ICON = { max: 'milestone', glory: 'glory' } as const;

function AwaitedCard({ v }: { readonly v: HeroView }) {
  const { t } = useText();
  const n = triggerN(v.unlock);
  return (
    <li className={styles.hero} data-hero={v.id}>
      <div className={styles.card}>
        <Portrait id={v.id} silhouette />
        <div className={styles.text}>
          <p className={styles.unknown}>{t('ui.hero.unknown')}</p>
          <p className={styles.unlock}>
            <Icon id="lock" />
            <span>{t(v.unlockKey, n === null ? {} : { n })}</span>
          </p>
        </div>
      </div>
    </li>
  );
}

const ComeCard = memo(function ComeCard({ v, mode }: { readonly v: ComeHero; readonly mode: BuyMode }) {
  const text = useText();
  const { t } = text;
  const act = useAct();
  const noteId = useId();
  const disabled = v.blocked !== null;
  const hop = useHop<HTMLButtonElement>(!disabled, mode);
  const name = t(v.nameKey);
  const title = t(v.titleKey);
  const top = v.blocked === 'max';
  const price = v.price === null ? t('ui.price.none') : t('ui.price.glory', { value: text.num(v.price) });
  return (
    <li className={styles.hero} data-hero={v.id} data-come="">
      <div className={styles.card}>
        <Portrait id={v.id} />
        <div className={styles.text}>
          <p className={styles.head}>
            <span className={styles.name}>{name}</span>
            <span className={styles.level}>{t('ui.hero.level', { level: v.level, max: v.levelMax })}</span>
          </p>
          {/* One line; the whole title on hover and in the card's words for assistive tech. */}
          <p className={styles.title} title={title}>
            {title}
          </p>
          <ul className={styles.effects}>
            {v.effects.map((e) => (
              <li key={e.kind}>{effectLine(text, e)}</li>
            ))}
          </ul>
        </div>
      </div>
      <div className={styles.foot}>
        {v.blocked !== null && (
          <p id={noteId} className={styles.note}>
            <Icon id={BLOCK_ICON[v.blocked]} />
            <span>{t(`ui.block.${v.blocked}`)}</span>
          </p>
        )}
        <button
          ref={hop}
          type="button"
          className={styles.buy}
          disabled={disabled}
          aria-label={top ? t('ui.hero.buyTop', { name }) : t('ui.hero.buy', { name, count: v.count, price })}
          aria-describedby={v.blocked !== null ? noteId : undefined}
          onClick={() => {
            act({ type: 'levelHero', id: v.id, mode });
          }}
        >
          <span>{top ? t('ui.hero.buttonTop') : t('ui.hero.button', { count: v.count })}</span>
          {v.price !== null && (
            <span className={styles.price}>
              <Icon id="glory" fallback={t('ui.price.gloryAbbr')} />
              <span>{text.short(v.price)}</span>
            </span>
          )}
        </button>
      </div>
    </li>
  );
});

function Heroes({ mode }: { readonly mode: BuyMode }) {
  const { t } = useText();
  const headingId = useId();
  const select = useCallback((s: GameState) => heroesView(s, mode), [mode]);
  const heroes = useGame(select, sameHeroes);
  return (
    <section className={styles.block} aria-labelledby={headingId}>
      <h2 id={headingId} className={styles.heading}>
        {t('ui.heroes.title')}
      </h2>
      <ul className={styles.list}>
        {heroes.map((v) => (hasCome(v) ? <ComeCard key={v.id} v={v} mode={mode} /> : <AwaitedCard key={v.id} v={v} />))}
      </ul>
    </section>
  );
}

interface BranchLine {
  readonly id: CultureBranchId;
  readonly open: boolean;
  readonly learned: number;
}

const NODES_OF: Readonly<Record<CultureBranchId, number>> = {
  music: CULTURE_NODES.filter((n) => n.branch === 'music').length,
  customs: CULTURE_NODES.filter((n) => n.branch === 'customs').length,
};

const selectBranches = (s: GameState): readonly BranchLine[] =>
  CULTURE_BRANCHES.map((b) => ({
    id: b.id,
    open: cultureBranchOpen(b, s),
    learned: CULTURE_NODES.filter((n) => n.branch === b.id && (s.culture[n.id] ?? 0) > 0).length,
  }));

const sameBranches = (a: readonly BranchLine[], b: readonly BranchLine[]): boolean =>
  a.length === b.length && a.every((x, i) => x.id === b[i]?.id && x.open === b[i].open && x.learned === b[i].learned);

/** The branches until the tree (M4-13): each one's name, and how far it is learned or when it opens. */
function Branches() {
  const { t } = useText();
  const headingId = useId();
  const lines = useGame(selectBranches, sameBranches);
  return (
    <section className={styles.block} aria-labelledby={headingId}>
      <h2 id={headingId} className={styles.heading}>
        {t('ui.culture.branches')}
      </h2>
      <ul className={styles.list}>
        {lines.map((b) => {
          const def = CULTURE_BRANCHES.find((x) => x.id === b.id);
          return (
            <li key={b.id} className={styles.branch} data-branch={b.id} data-open={b.open ? '' : undefined}>
              <span className={styles.niche}>
                <Icon id={CULTURE_ICON[b.id]} />
              </span>
              <div className={styles.text}>
                <p className={styles.name}>{def ? t(def.nameKey) : b.id}</p>
                {b.open ? (
                  <p className={styles.learned}>
                    {t('ui.culture.learned', { count: b.learned, total: NODES_OF[b.id] })}
                  </p>
                ) : (
                  <p className={styles.unlock}>
                    <Icon id="lock" />
                    <span>{def ? t(def.unlockKey) : ''}</span>
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function CultureTab({ mode }: { readonly mode: BuyMode }) {
  return (
    <>
      <Heroes mode={mode} />
      <Branches />
    </>
  );
}
