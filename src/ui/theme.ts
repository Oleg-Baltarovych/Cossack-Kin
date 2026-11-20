// DOM UI theme (SPEC §5.3, §6.1; .claude/rules/ui.md). Colours come from the master palette as CSS variables
// (`--c-<ramp>-<i>`, dark → light), so the UI CSS holds no hex of its own. Sizes follow the world's integer scale:
// `--px` is one logical px in CSS px. The pixel font (Press Start 2P, 8 font px per em) stays crisp only when one font
// px is a whole number of device px, so the two text sizes are picked in device px:
//   --font-s ≈ 1.25 logical px per font px (row text), --font-m = 2 logical px per font px (the HUD counters).
// `--tap` is the tap-target side: at least 44 css px, in whole logical px.
import master from '../../assets-src/palettes/master.json';
import { computeViewport } from '../render/viewport.ts';

const FONT_EM_PX = 8;
const SMALL_FONT_PX = 1.25;
const MEDIUM_FONT_PX = 2;
/** Minimum tap target, css px (SPEC §6.8: 44×44 pt). */
const TAP_MIN_CSS_PX = 44;

/** Writes the palette variables on `root` (once). */
export function applyPalette(root: HTMLElement): void {
  for (const [ramp, colors] of Object.entries(master.ramps)) {
    colors.forEach((hex, i) => {
      root.style.setProperty(`--c-${ramp}-${String(i)}`, hex);
    });
  }
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
  };
  apply();
  win.addEventListener('resize', apply);
  return () => {
    win.removeEventListener('resize', apply);
  };
}
