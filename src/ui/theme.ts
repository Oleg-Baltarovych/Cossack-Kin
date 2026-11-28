// DOM UI theme (SPEC §5.3, §6.1; .claude/rules/ui.md). Colours come from the master palette as CSS variables
// (`--c-<ramp>-<i>`, dark → light), so the UI CSS holds no hex of its own. Components read colour ROLES
// (`--ui-<role>`, ADR 014): one meaning per role, each a palette ramp + index (UI_ROLES); the bevel recipes that
// combine them live in global.css (UI_RECIPES). Sizes follow the world's integer scale:
// `--px` is one logical px in CSS px. The pixel font (Press Start 2P, 8 font px per em) stays crisp only when one font
// px is a whole number of device px, so the two text sizes are picked in device px:
//   --font-s ≈ 1.25 logical px per font px (row text), --font-m = 2 logical px per font px (the HUD counters).
// `--tap` is the tap-target side: at least 44 css px, in whole logical px. Button juice (plan M2-26, content BUTTON):
// `--press-y` is the pressed offset and `--hop-y` the affordable hop, both in whole logical px; `--hop-ms` its length.
import master from '../../assets-src/palettes/master.json';
import { BUTTON } from '../content/juice.ts';
import { computeViewport } from '../render/viewport.ts';

const FONT_EM_PX = 8;
const SMALL_FONT_PX = 1.25;
const MEDIUM_FONT_PX = 2;
/** Minimum tap target, css px (SPEC §6.8: 44×44 pt). */
const TAP_MIN_CSS_PX = 44;

type Ramp = keyof typeof master.ramps;

/**
 * Colour roles (ADR 014, plan M4-16a): role → [ramp, index]. Surfaces: `frame` (HUD, the sheet, windows' plaques),
 * `panel` (boards over the list, a window's body, the tab bar), `card` (sunken), `control` (raised), `disabled` (flat).
 * Accents: crimson = selection and culture, gold = buy or claim now and nothing else, ochre = headings and levels,
 * green = a gain (the delta only), `short` + an icon = a shortage. Text tiers: name > body > desc > meta.
 * Contrast (WCAG AA, ≥ 4.5:1) is measured on the surface each tier sits on: `meta` passes on wood 0 only (5.8:1;
 * 4.35:1 on wood 1), so meta text on a `panel` takes `desc`; `short` likewise lives on wood 0 (5.3:1).
 */
export const UI_ROLES = {
  // Surfaces.
  frame: ['wood', 0],
  panel: ['wood', 1],
  card: ['wood', 0],
  control: ['wood', 2],
  'control-on': ['wood', 3],
  disabled: ['wood', 1],
  // Lines: the 1-px outline of every box, a disabled box's rim, a plain rule, the seam between rows, the bevel light
  // and shade.
  edge: ['ink', 0],
  'edge-off': ['ink', 1],
  rule: ['wood', 2],
  // Culture-tree prerequisite lines: plain, and a learned path.
  link: ['wood', 3],
  'link-on': ['thatch', 3],
  seam: ['wood', 1],
  'bevel-hi': ['wood', 3],
  'bevel-lo': ['ink', 1],
  // Accents.
  // Selection (tab, picker, node, a lit row) only; keyboard focus has its own light `focus` ring (≥ 3:1 on wood 0/1).
  select: ['crimson', 3],
  focus: ['plaster', 6],
  buy: ['gold', 4],
  'buy-hi': ['gold', 5],
  'buy-lo': ['gold', 2],
  'buy-text': ['ink', 0],
  heading: ['thatch', 5],
  title: ['thatch', 6],
  gain: ['grass', 6],
  short: ['crimson', 5],
  calm: ['sky', 6],
  dot: ['crimson', 4],
  // The road bar keeps the old gold until M4.5 gives progress its own look (UX triage M3).
  progress: ['gold', 4],
  stitch: ['crimson', 3],
  'band-gold': ['gold', 2],
  // Text tiers.
  name: ['plaster', 6],
  body: ['plaster', 5],
  desc: ['plaster', 3],
  meta: ['plaster', 2],
  'off-text': ['plaster', 2],
  'off-price': ['thatch', 4],
  // Portrait plinths and picture niches (direction C accents).
  portrait: ['wood', 2],
  plinth: ['earth', 2],
  'plinth-hi': ['wood', 4],
  'plinth-lo': ['ink', 1],
  niche: ['wood', 3],
  // Window scrims: warm-dark by day, cool at dusk and at night (`html[data-phase]`, ui/phase.ts).
  scrim: ['ink', 0],
  'scrim-dusk': ['ink', 1],
  'scrim-night': ['cloth', 0],
} as const satisfies Record<string, readonly [Ramp, number]>;

export type UiRole = keyof typeof UI_ROLES;

/** `--ui-*` recipes defined in global.css from the roles (bevels, the stitched rule): not colours themselves. */
export const UI_RECIPES: readonly string[] = ['raised', 'sunken', 'stitch-rule'];

/** Each role's hex from the master palette. */
export function roleColors(): Record<UiRole, string> {
  // An empty object typed as the full record: the loop below assigns every key of UI_ROLES before it is returned.
  const out = {} as Record<UiRole, string>;
  // Object.entries loses the key type; the keys are exactly UiRole by construction.
  for (const [role, [ramp, i]] of Object.entries(UI_ROLES) as [UiRole, (typeof UI_ROLES)[UiRole]][]) {
    const hex = master.ramps[ramp][i];
    if (hex === undefined) throw new Error(`theme: --ui-${role} → ${ramp} ${String(i)} is not in the palette`);
    out[role] = hex;
  }
  return out;
}

/** Writes the palette variables and the colour roles on `root` (once). */
export function applyPalette(root: HTMLElement): void {
  for (const [ramp, colors] of Object.entries(master.ramps)) {
    colors.forEach((hex, i) => {
      root.style.setProperty(`--c-${ramp}-${String(i)}`, hex);
    });
  }
  for (const [role, hex] of Object.entries(roleColors())) root.style.setProperty(`--ui-${role}`, hex);
}

export interface UiScale {
  /** One logical px in CSS px. */
  readonly px: number;
  readonly fontS: number;
  readonly fontM: number;
  /** A tap target's side: ≥ 44 css px and a whole number of logical px (the pixel grid). */
  readonly tap: number;
}

/** The UI sizes in CSS px for a `cssW` × `cssH` viewport at `dpr`. */
export function uiScale(cssW: number, cssH: number, dpr: number): UiScale {
  const ratio = Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
  const { scale } = computeViewport(cssW, cssH, ratio);
  // Device px per font px; at scale 1 both round to 2, so the counters take one more to stay larger.
  const small = Math.ceil(scale * SMALL_FONT_PX);
  const medium = Math.max(Math.ceil(scale * MEDIUM_FONT_PX), small + 1);
  const px = scale / ratio;
  // 1e-9: 44 / (4 / 3.5) is 38.5000…01 in floats, not 39 logical px.
  const tap = Math.ceil(TAP_MIN_CSS_PX / px - 1e-9) * px;
  return { px, fontS: (small * FONT_EM_PX) / ratio, fontM: (medium * FONT_EM_PX) / ratio, tap };
}

/** Keeps `--px` (+ unitless `--px-n`), `--font-s` and `--font-m` on `root` in step with the viewport; returns the stop function. */
export function trackScale(root: HTMLElement, win: Window = window): () => void {
  const apply = (): void => {
    const s = uiScale(win.innerWidth, win.innerHeight, win.devicePixelRatio);
    root.style.setProperty('--px', `${String(s.px)}px`);
    // The same as a bare number, for `transform: scale()` (UI icons, M2-14).
    root.style.setProperty('--px-n', String(s.px));
    root.style.setProperty('--font-s', `${String(s.fontS)}px`);
    root.style.setProperty('--font-m', `${String(s.fontM)}px`);
    root.style.setProperty('--tap', `${String(s.tap)}px`);
    root.style.setProperty('--press-y', `${String(BUTTON.pressPx * s.px)}px`);
    root.style.setProperty('--hop-y', `${String(BUTTON.hopPx * s.px)}px`);
    root.style.setProperty('--hop-ms', `${String(BUTTON.hopMs)}ms`);
  };
  apply();
  win.addEventListener('resize', apply);
  return () => {
    win.removeEventListener('resize', apply);
  };
}
