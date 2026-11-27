// The raid map (plan M3-11; SPEC §2.6, §3.4, §10; plan §0.1 П1–П3/П5/П9): a full-screen window over the game with the
// parchment map of the Lower Dnipro at ×2 (RAID_MAP.scale), today's board as five flags at their regions
// (`raidBoardView`), the rumour's glint beside its flag, and a rider for every squad on the road. A flag is a button
// (the --tap box, larger than its sprite); its name says tier, duration, region and the chance (or the power still
// missing to set off). While the art is loading, if it never comes, if a flag's frame is missing, or at ×1 (the tap
// boxes would overlap: raid-map-layout test), the five offers are a visible list of buttons under the map instead.
// The map opens on the suggested offer (`raidSuggested`: the onboarding tier, else the rumour, else the longest tier in
// reach); its card sits right under the map — the content is top-anchored, so another flag's taller or shorter card
// never moves the map — and its footer, the reason and «Вирушити», is pinned to the window's bottom in thumb reach, with exactly the numbers the start would roll (shown = granted,
// §0.1 П3): duration and «повернуться о …» on the game clock, the chance and the loot of a success first, then the
// failure's loot, the relic and pysanky chances (Q21), the rumour's bonus, «реліквія близько» (П5), the power to 100 %,
// and «Вирушити» — off with its reason when no squad is free or the army is too weak (then the card says how much power
// is missing to set off instead of the chance, which is only the floor then). «Вирушити» starts from the slot the map
// was opened for while it is free, else from the board's free one (the header names it); a start the core refuses
// keeps the map open and says why. No countdown to the next board (П2): only «Завтра — нові чутки». Region names are
// DOM text (i18n), never in the art.
// Keyboard and readers: the flags are one roving group in tier order (arrows, Home/End move the focus; Enter/Space
// choose); a choice is read out by a polite status line; Tab stays inside the window; Esc closes it like «Закрити».
// The window takes the focus itself — except on the first-raid step (`raidGuide`), when the 5-minute flag does, lit
// for SHEET.highlightMs (П9). «Менше руху»: the light does not pulse and the rider stands on its first frame.
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type RefObject,
} from 'react';
import { SHEET } from '../../content/juice.ts';
import { BOARD, RAID_MAP, RAIDS, REGIONS, type RaidTierId, type Region, type RegionId } from '../../content/raids.ts';
import type { RejectReason } from '../../core/events.ts';
import {
  raidBoardView,
  raidGuide,
  raidSlotsView,
  raidSuggested,
  type RaidBoardView,
  type RaidOfferView,
} from '../../core/raid-selectors.ts';
import { wholePercent } from '../../core/percent.ts';
import type { GameState } from '../../core/state.ts';
import { raidTier } from '../../core/systems/raids.ts';
import { formatReturnAt } from '../../i18n/index.ts';
import { useDeviceSnap } from '../hooks/useDeviceSnap.ts';
import { trapTab } from '../hooks/useDialogFocus.ts';
import { useAct, useGame, useGameReader } from '../hooks/useGame.ts';
import { useText, type Text } from '../hooks/useText.ts';
import { raidWhere, regionName } from '../raidText.ts';
import { squadStride, useRaidMapAtlas, type MapSprite, type RaidMapAtlas } from '../raidMap.ts';
import { grantedText } from '../rewards.ts';
import styles from './RaidMap.module.css';

const MS_PER_SEC = 1000;
/** The tier that is said «на ніч» on its flag and in its name (§0.1 П1). */
const NIGHT_TIER: RaidTierId = 'h8';
/**
 * Width slack when deciding whether the map fits at ×2: layout widths are on 1/64 css px, so a window exactly as wide
 * as the map may measure a hair narrower — half a css px is far less than one logical px at any scale.
 */
const FIT_SLACK_PX = 0.5;

const REGION_BY_ID: ReadonlyMap<RegionId, Region> = new Map(
  Object.values(REGIONS).flatMap((list) => list.map((r) => [r.id, r] as const)),
);

/** A whole percent from the core (`wholePercent`) in the player's format: «80 %» / «80%». */
const pct = (text: Text, whole: number): string => text.t('ui.percent', { value: text.num(whole) });

const where = raidWhere;

/** What decides an offer now: its chance, or — off for want of power — how much power is still missing. */
const offerState = (text: Text, o: RaidOfferView): string =>
  o.blocked === 'power'
    ? text.t('ui.map.need', { value: text.num(o.powerToStart), count: o.powerToStart })
    : text.t('ui.map.chanceOf', { chance: pct(text, o.chancePct) });

/** A flag's (or list button's) accessible name: «Застава, 1 година — Самара, шанс 80 %» (+ «на ніч», + the rumour). */
function markerName(text: Text, o: RaidOfferView): string {
  const marker = text.t(o.tier === NIGHT_TIER ? 'ui.map.markerNight' : 'ui.map.marker', {
    tier: text.t(raidTier(o.tier).nameKey),
    time: text.dur(o.durationSec),
    region: regionName(text, o.region),
    state: offerState(text, o),
  });
  const rumor = o.rumor === null ? null : BOARD.rumors.find((r) => r.id === o.rumor);
  return rumor ? text.t('ui.map.markerRumor', { marker, rumor: text.t(rumor.nameKey) }) : marker;
}

/** Ducats and glory in words: «+500 дук., +50 слави». */
const lootText = (text: Text, loot: RaidOfferView['success']): string =>
  [
    grantedText(text, { currency: 'ducats', amount: loot.ducats }),
    grantedText(text, { currency: 'glory', amount: loot.glory }),
  ].join(text.t('ui.raids.listSep'));

// --- what the map reads of the store ------------------------------------------------------------------------------

/** Field by field; the two loot objects by their Big values. */
function sameOffer(a: RaidOfferView, b: RaidOfferView): boolean {
  // Object.keys widens to string[]; an offer's own keys are exactly keyof RaidOfferView.
  const keys = Object.keys(a) as (keyof RaidOfferView)[];
  return keys.every((key) => {
    if (key === 'success' || key === 'failure') return a[key].ducats.eq(b[key].ducats) && a[key].glory.eq(b[key].glory);
    return Object.is(a[key], b[key]);
  });
}
const sameBoard = (a: RaidBoardView, b: RaidBoardView): boolean =>
  a.freeSlot === b.freeSlot &&
  a.offers.length === b.offers.length &&
  a.offers.every((o, i) => {
    const p = b.offers[i];
    return p !== undefined && sameOffer(o, p);
  });

/** A squad on the road, as the map draws it (no result: the view has none, П4). */
interface Away {
  readonly slot: number;
  readonly tier: RaidTierId;
  readonly region: RegionId;
}
const selectAway = (s: GameState): readonly Away[] =>
  raidSlotsView(s, s.time.lastSeen).flatMap((v) =>
    v.kind === 'running' ? [{ slot: v.slot, tier: v.tier, region: v.region }] : [],
  );
const sameAway = (a: readonly Away[], b: readonly Away[]): boolean =>
  a.length === b.length &&
  a.every((x, i) => {
    const y = b[i];
    return y !== undefined && x.slot === y.slot && x.tier === y.tier && x.region === y.region;
  });

// --- layout -------------------------------------------------------------------------------------------------------

/** `--px-n` (one logical px in css px) of the root, re-read only when the window resizes (theme.ts sets it then). */
function usePxN(): number {
  const read = (): number =>
    Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--px-n')) || 1;
  const [px, setPx] = useState(read);
  useEffect(() => {
    const onResize = (): void => {
      setPx(read());
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
    };
  }, []);
  return px;
}

/**
 * Logical px per map px: RAID_MAP.scale when the window is wide enough for the whole map at it, else 1. Measured on
 * the window's content box (a phone narrower than 360 logical px would cut the map's frame).
 */
function useMapScale(box: RefObject<HTMLElement | null>): number {
  const px = usePxN();
  const [k, setK] = useState<number>(RAID_MAP.scale);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return undefined;
    const measure = (): void => {
      const width = el.clientWidth;
      // No layout (a test DOM): keep the art's own scale.
      if (width <= 0) return;
      setK(width + FIT_SLACK_PX >= RAID_MAP.w * RAID_MAP.scale * px ? RAID_MAP.scale : 1);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, [box, px]);
  return k;
}

/** A CSS sprite of the map atlas with its pivot at map px (`x`, `y`), drawn at the map's scale (whole device px). */
function Sprite({
  atlas,
  s,
  x,
  y,
  className,
  extra,
}: {
  readonly atlas: RaidMapAtlas;
  readonly s: MapSprite;
  readonly x: number;
  readonly y: number;
  readonly className?: string | undefined;
  readonly extra?: Readonly<Record<string, string | number>>;
}) {
  // Custom properties are not CSSProperties keys: React passes them through as they are.
  const style = {
    '--x': x - s.px,
    '--y': y - s.py,
    width: `${String(s.w)}px`,
    height: `${String(s.h)}px`,
    backgroundImage: `url("${atlas.url}")`,
    backgroundPosition: `${String(-s.x)}px ${String(-s.y)}px`,
    ...extra,
  } as CSSProperties;
  return <span className={[styles.sprite, className].filter(Boolean).join(' ')} style={style} aria-hidden="true" />;
}

// --- the offer card -----------------------------------------------------------------------------------------------

const REFUSED: Partial<Record<RejectReason, string>> = {
  slotBusy: 'ui.map.refused.slotBusy',
  power: 'ui.map.refused.power',
};

function OfferCard({ offer, slot, onStarted }: { offer: RaidOfferView; slot: number | null; onStarted: () => void }) {
  const text = useText();
  const act = useAct();
  const titleId = useId();
  const noteId = useId();
  // A start the core refused although the card allowed it (the state moved under it): the map stays, saying why.
  const [refused, setRefused] = useState<string | null>(null);
  // «Повернуться о …» if it set off now: a string, so the card re-renders only when the minute it reads changes.
  const back = useGame(
    useCallback(
      (s: GameState) =>
        formatReturnAt(
          s.settings.lang,
          s.time.lastSeen + offer.durationSec * MS_PER_SEC,
          s.time.lastSeen,
          s.settings.tzOffsetMin,
        ),
      [offer.durationSec],
    ),
  );
  const rumor = offer.rumor === null ? null : (BOARD.rumors.find((r) => r.id === offer.rumor) ?? null);
  const weak = offer.blocked === 'power';
  const reason =
    slot === null || offer.blocked === 'slotBusy' ? text.t('ui.map.busy') : weak ? text.t('ui.map.power') : null;
  const name = where(text, offer.tier, offer.region);
  // What a raid that cannot set off yet would bring is shown dim: the player sees what is coming, not a promise.
  const minor = [styles.fact, styles.minor, weak ? styles.dim : ''].join(' ');
  // Two of the window's own rows: the card, then its footer pinned to the window's bottom (not the card's).
  return (
    <>
      <section
        className={styles.card}
        aria-labelledby={titleId}
        data-offer={offer.tier}
        data-blocked={offer.blocked ?? ''}
      >
        <header className={styles.cardHead}>
          <h3 id={titleId} className={styles.cardTitle}>
            {name}
          </h3>
          <p className={styles.when}>{text.t('ui.map.when', { time: text.dur(offer.durationSec), back })}</p>
        </header>
        {weak && (
          <p className={styles.need}>
            {text.t('ui.map.toStart', { value: text.num(offer.powerToStart), count: offer.powerToStart })}
          </p>
        )}
        <dl className={styles.facts}>
          {!weak && (
            <div className={[styles.fact, styles.major].join(' ')} data-fact="chance">
              <dt>{text.t('ui.map.chance')}</dt>
              <dd>{pct(text, offer.chancePct)}</dd>
            </div>
          )}
          <div className={[styles.fact, styles.major, weak ? styles.dim : ''].join(' ')} data-fact="success">
            <dt>{text.t('ui.map.success')}</dt>
            <dd className={weak ? undefined : styles.good}>{lootText(text, offer.success)}</dd>
          </div>
          <div className={minor} data-fact="failure">
            <dt>{text.t('ui.map.failure')}</dt>
            <dd>{lootText(text, offer.failure)}</dd>
          </div>
          {offer.relicPct > 0 && (
            <div className={minor} data-fact="relic">
              <dt>{text.t('ui.map.relic')}</dt>
              <dd>{text.t('ui.map.relicValue', { chance: pct(text, offer.relicPct) })}</dd>
            </div>
          )}
          {offer.pysankyPct > 0 && (
            <div className={minor} data-fact="pysanky">
              <dt>{text.t('ui.map.pysanky')}</dt>
              <dd>
                {text.t('ui.map.pysankyValue', {
                  chance: pct(text, offer.pysankyPct),
                  min: RAIDS.pysanky.min,
                  count: RAIDS.pysanky.max,
                })}
              </dd>
            </div>
          )}
        </dl>
        {rumor && (
          <p className={styles.rumor}>
            {text.t(rumor.effect.kind === 'loot' ? 'ui.map.rumorLoot' : 'ui.map.rumorRelic', {
              name: text.t(rumor.nameKey),
              value: pct(text, wholePercent(rumor.effect.share)),
            })}
          </p>
        )}
        {offer.relicSure && <p className={styles.sure}>{text.t('ui.map.relicSure')}</p>}
        {!weak && offer.powerToFull > 0 && (
          <p className={styles.quiet}>
            {text.t('ui.map.toFull', { value: text.num(offer.powerToFull), count: offer.powerToFull })}
          </p>
        )}
      </section>
      <footer className={styles.go}>
        <p id={noteId} className={styles.note} role="status">
          {refused ?? reason}
        </p>
        <button
          type="button"
          className={styles.button}
          disabled={reason !== null}
          aria-label={text.t('ui.map.goLabel', { where: name, n: (slot ?? 0) + 1 })}
          aria-describedby={reason !== null || refused !== null ? noteId : undefined}
          onClick={() => {
            if (slot === null) return;
            const events = act({ type: 'startRaid', slot, tier: offer.tier });
            if (events.some((e) => e.type === 'RaidStarted')) {
              onStarted();
              return;
            }
            const no = events.find((e) => e.type === 'ActionRejected');
            setRefused(text.t((no?.type === 'ActionRejected' && REFUSED[no.reason]) || 'ui.map.refused.other'));
          }}
        >
          {text.t('ui.map.go')}
        </button>
      </footer>
    </>
  );
}

// --- the window ---------------------------------------------------------------------------------------------------

export interface RaidMapProps {
  /** The slot whose «Обрати похід» opened the map (the start goes there while it is free). */
  readonly slot: number;
  /** «Закрити», Esc, or a raid that set off. */
  readonly onClose: () => void;
}

export function RaidMap({ slot, onClose }: RaidMapProps) {
  const text = useText();
  const titleId = useId();
  const boxRef = useRef<HTMLElement>(null);
  const markerRefs = useRef(new Map<RaidTierId, HTMLButtonElement>());
  const atlas = useRaidMapAtlas();
  const board = useGame(raidBoardView, sameBoard);
  const away = useGame(selectAway, sameAway);
  // Read once, on opening: the step it lights is done by the start that closes the map.
  const read = useGameReader();
  const [opening] = useState(() => {
    const s = read();
    return { guide: raidGuide(s), suggested: raidSuggested(s) };
  });
  const chosenFree = useGame(
    useCallback((s: GameState) => raidSlotsView(s, s.time.lastSeen)[slot]?.kind === 'idle', [slot]),
  );
  const target = chosenFree ? slot : board.freeSlot;
  const k = useMapScale(boxRef);
  const snapRef = useDeviceSnap<HTMLDivElement>([k, atlas]);

  const first = board.offers[0]?.tier ?? null;
  const [selected, setSelected] = useState<RaidTierId | null>(opening.suggested);
  const [focusTier, setFocusTier] = useState<RaidTierId | null>(opening.suggested ?? first);
  const [lit, setLit] = useState<RaidTierId | null>(opening.guide);
  const [said, setSaid] = useState<{ readonly id: number; readonly text: string } | null>(null);

  // Opening: the window takes the focus (Tab reaches the chosen flag); on the first-raid step the lit flag does.
  useEffect(() => {
    const { guide } = opening;
    const flag = guide === null ? undefined : markerRefs.current.get(guide);
    if (flag) flag.focus();
    else boxRef.current?.focus();
    if (guide === null) return undefined;
    const timer = setTimeout(() => {
      setLit(null);
    }, SHEET.highlightMs);
    return () => {
      clearTimeout(timer);
    };
  }, [opening]);

  const latest = useRef(onClose);
  useEffect(() => {
    latest.current = onClose;
  });
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent): void => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      e.preventDefault();
      latest.current();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  const choose = (o: RaidOfferView): void => {
    setSelected(o.tier);
    setFocusTier(o.tier);
    setSaid((p) => ({ id: (p?.id ?? 0) + 1, text: text.t('ui.map.chosen', { offer: markerName(text, o) }) }));
  };

  // The flags' roving focus, in tier order (the board's order).
  const onMarkerKey = (e: KeyboardEvent<HTMLElement>): void => {
    const tiers = board.offers.map((o) => o.tier);
    // From the flag the key was pressed on (its focus may not have reached the state yet), else the Tab stop.
    const on = tiers.findIndex((tier) => markerRefs.current.get(tier) === e.target);
    const i = on >= 0 ? on : focusTier === null ? 0 : Math.max(0, tiers.indexOf(focusTier));
    const n = tiers.length;
    const to: Partial<Record<string, number>> = {
      ArrowRight: (i + 1) % n,
      ArrowDown: (i + 1) % n,
      ArrowLeft: (i - 1 + n) % n,
      ArrowUp: (i - 1 + n) % n,
      Home: 0,
      End: n - 1,
    };
    const index = to[e.key];
    if (index === undefined || n === 0) return;
    e.preventDefault();
    const next = tiers[index];
    if (next === undefined) return;
    setFocusTier(next);
    markerRefs.current.get(next)?.focus();
  };

  const ready = atlas !== 'loading' && atlas !== 'failed' ? atlas : null;
  // The flags are buttons on the map only when every one can be drawn and their tap boxes stay apart (×2).
  const onMap = ready !== null && k === RAID_MAP.scale && board.offers.every((o) => ready.markers.has(o.tier));
  // The art arriving (or the scale changing) swaps the list for the flags: a focused button is removed without a blur,
  // so the focus follows to the same offer's new button instead of falling to the page.
  // Read while rendering the swap, before the commit removes the old buttons (a ref: no state, no extra render).
  const swap = useRef<{ onMap: boolean; focused: RaidTierId | null }>({ onMap, focused: null });
  if (swap.current.onMap !== onMap) {
    const active = typeof document === 'undefined' ? null : document.activeElement;
    const tier = [...markerRefs.current].find(([, el]) => el === active)?.[0] ?? null;
    swap.current = { onMap, focused: tier };
  }
  useEffect(() => {
    const tier = swap.current.focused;
    swap.current = { onMap, focused: null };
    if (tier !== null) markerRefs.current.get(tier)?.focus();
  }, [onMap]);
  const offer = selected === null ? null : (board.offers.find((o) => o.tier === selected) ?? null);
  const L = RAID_MAP;
  // Custom properties (numbers for calc()) are not CSSProperties keys: React passes them through as they are.
  const mapStyle = {
    '--k': k,
    '--map-w': L.w,
    '--map-h': L.h,
    '--tag-right': L.tag.right,
    '--tag-left': L.tag.left,
    '--tag-dy': L.tag.dy,
  } as CSSProperties;
  const stride = ready ? squadStride(ready.squad) : null;
  const awayList = away.map((a) => text.t('ui.map.awayItem', { n: a.slot + 1, where: where(text, a.tier, a.region) }));

  const flagButton = (
    o: RaidOfferView,
    className: string | undefined,
    style: CSSProperties | undefined,
    label: string | undefined,
  ) => (
    <button
      ref={(el) => {
        if (el) markerRefs.current.set(o.tier, el);
        else markerRefs.current.delete(o.tier);
      }}
      type="button"
      className={className}
      style={style}
      tabIndex={o.tier === focusTier ? 0 : -1}
      aria-pressed={o.tier === selected}
      aria-label={markerName(text, o)}
      data-lit={o.tier === lit ? '' : undefined}
      onFocus={() => {
        setFocusTier(o.tier);
      }}
      onClick={() => {
        choose(o);
      }}
    >
      {label}
    </button>
  );

  return (
    <div className={styles.backdrop}>
      <section
        ref={boxRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={(e) => {
          if (boxRef.current) trapTab(e, boxRef.current);
        }}
      >
        <header className={styles.top}>
          <h2 id={titleId} className={styles.title}>
            {text.t('ui.map.title')}
            <span className={styles.slot}>{text.t('ui.map.slot', { n: (target ?? slot) + 1 })}</span>
          </h2>
          <button
            type="button"
            className={[styles.button, styles.second].join(' ')}
            aria-label={text.t('ui.map.closeLabel')}
            onClick={onClose}
          >
            {text.t('ui.map.close')}
          </button>
        </header>
        <div className={styles.frame} style={mapStyle}>
          <div
            ref={snapRef}
            className={styles.map}
            data-map={atlas === 'loading' ? 'loading' : ready ? 'ready' : 'failed'}
          >
            {ready?.map && <Sprite atlas={ready} s={ready.map} x={0} y={0} />}
            {atlas === 'loading' && <p className={styles.mapNote}>{text.t('ui.map.loading')}</p>}
            {atlas === 'failed' && <p className={styles.mapNote}>{text.t('ui.map.failed')}</p>}
            {ready &&
              away.map((a) => {
                const r = REGION_BY_ID.get(a.region);
                const f = ready.squad[0];
                if (!r || !f) return null;
                return (
                  <Sprite
                    key={`away-${String(a.slot)}`}
                    atlas={ready}
                    s={f}
                    x={r.x + L.squadDx}
                    y={r.y}
                    className={stride !== null ? styles.march : undefined}
                    extra={stride !== null ? { '--sx': -f.x, '--stride': stride, '--frames': ready.squad.length } : {}}
                  />
                );
              })}
            {ready &&
              board.offers.map((o) => {
                const r = REGION_BY_ID.get(o.region);
                const marker = ready.markers.get(o.tier);
                if (!r || !marker) return null;
                // Map px for calc() (see mapStyle).
                const at = { '--x': r.x, '--y': r.y } as CSSProperties;
                return (
                  <div key={o.tier} className={styles.place} data-tier={o.tier} data-region={o.region}>
                    <Sprite atlas={ready} s={marker} x={r.x} y={r.y} />
                    <span className={styles.foot} style={at} aria-hidden="true" />
                    {o.rumor !== null && ready.rumor && (
                      <Sprite atlas={ready} s={ready.rumor} x={r.x + r.glint.dx} y={r.y + r.glint.dy} />
                    )}
                    {/* The short tier name by the night flag always («на ніч», П1) and by the chosen one: five
                        plates at once crowd the parchment (M3-11 screens). Its side is the region's (content). */}
                    {onMap && (o.tier === NIGHT_TIER || o.tier === selected) && (
                      <span
                        className={[styles.tag, r.tag === 'left' ? styles.tagLeft : ''].join(' ')}
                        style={at}
                        aria-hidden="true"
                      >
                        {text.t(`raid.tier.${o.tier}.short`)}
                      </span>
                    )}
                  </div>
                );
              })}
            {onMap && (
              <div
                className={styles.markers}
                role="group"
                aria-label={text.t('ui.map.markers')}
                onKeyDown={onMarkerKey}
              >
                {board.offers.map((o) => {
                  const r = REGION_BY_ID.get(o.region);
                  if (!r) return null;
                  // The tap box's centre in map px (see mapStyle).
                  const tap = { '--x': r.x + L.flagCentre.dx, '--y': r.y + L.flagCentre.dy } as CSSProperties;
                  return <span key={o.tier}>{flagButton(o, styles.marker, tap, undefined)}</span>;
                })}
              </div>
            )}
          </div>
        </div>
        {!onMap && board.offers.length > 0 && (
          <div className={styles.list} role="group" aria-label={text.t('ui.map.markers')} onKeyDown={onMarkerKey}>
            {board.offers.map((o) => (
              <span key={o.tier} className={styles.listItem}>
                {flagButton(
                  o,
                  styles.listButton,
                  undefined,
                  text.t('ui.map.list', {
                    short: text.t(`raid.tier.${o.tier}.short`),
                    region: regionName(text, o.region),
                    state: offerState(text, o),
                  }),
                )}
              </span>
            ))}
          </div>
        )}
        <div className={styles.below}>
          <p className={styles.quiet}>{text.t('ui.map.tomorrow')}</p>
          {awayList.length > 0 && (
            <p className={styles.away}>{text.t('ui.map.away', { list: awayList.join(text.t('ui.raids.listSep')) })}</p>
          )}
        </div>
        <p className={styles.sr} role="status">
          {said && <span key={said.id}>{said.text}</span>}
        </p>
        {offer ? (
          <OfferCard key={offer.tier} offer={offer} slot={target} onStarted={onClose} />
        ) : (
          <p className={styles.empty}>{text.t('ui.map.empty')}</p>
        )}
      </section>
    </div>
  );
}
