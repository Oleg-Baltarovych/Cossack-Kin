// The «Культура» tab (plan M4-12, SPEC §10.3, §0.1 П5): on top the «Герої» block — a card per hero: his ×2 portrait,
// name and title, level of the cap, each effect «зараз → після» for the shared ×1/×10/×25/Max picker, and «Підвищити»
// with its price (off with the reason, `aria-describedby`, as a building row). A hero who has not come is a silhouette,
// «Невідомий гість» and when he comes (his beat's trigger from content). Below, the two branches as trees with the
// node card (`CultureTree`, M4-13). Every number is a core view's (`heroesView`, percents by `effectPercent`); the UI
// only formats.
import { memo, useCallback, useId, type ReactNode } from 'react';
import type { StoryTrigger } from '../../content/story.ts';
import { heroesView, type HeroBlock, type HeroView } from '../../core/culture-selectors.ts';
import type { BuyMode } from '../../core/economy.ts';
import type { GameState } from '../../core/state.ts';
import { useAct, useGame } from '../hooks/useGame.ts';
import { useHop } from '../hooks/useHop.ts';
import { useText } from '../hooks/useText.ts';
import { sameBig } from '../effectText.ts';
import { EffectLine } from './EffectLine.tsx';
import { Icon } from './Icon.tsx';
import { Portrait } from './Portrait.tsx';
import { CultureTree } from './CultureTree.tsx';
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
              <li key={e.kind}>
                <EffectLine text={text} effect={e} />
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className={styles.foot}>
        {v.blocked !== null && (
          <p id={noteId} className={styles.note} data-short={v.blocked === 'glory' || undefined}>
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

function Heroes({ mode, picker }: { readonly mode: BuyMode; readonly picker: ReactNode }) {
  const { t } = useText();
  const headingId = useId();
  const select = useCallback((s: GameState) => heroesView(s, mode), [mode]);
  const heroes = useGame(select, sameHeroes);
  return (
    <section className={styles.block} aria-labelledby={headingId}>
      <h2 id={headingId} className={styles.heading}>
        {t('ui.heroes.title')}
      </h2>
      {picker}
      <ul className={styles.list}>
        {heroes.map((v) => (hasCome(v) ? <ComeCard key={v.id} v={v} mode={mode} /> : <AwaitedCard key={v.id} v={v} />))}
      </ul>
    </section>
  );
}

/** `picker`: the shared ×1/×10/×25/Max picker — on this tab it levels only the heroes, so it stands in their block. */
export interface CultureTabProps {
  readonly mode: BuyMode;
  readonly picker: ReactNode;
}

export function CultureTab({ mode, picker }: CultureTabProps) {
  return (
    <>
      <Heroes mode={mode} picker={picker} />
      <CultureTree />
    </>
  );
}
