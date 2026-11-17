// DOM UI theme (SPEC §5.3, §6.1; .claude/rules/ui.md). Colours come from the master palette as CSS variables
// (`--c-<ramp>-<i>`, dark → light), so the UI CSS holds no hex of its own. Sizes follow the world's integer scale:
// `--px` is one logical px in CSS px. The pixel font (Press Start 2P, 8 font px per em) stays crisp only when one font
// px is a whole number of device px, so the two text sizes are picked in device px:
//   --font-s ≈ 1.25 logical px per font px (row text), --font-m = 2 logical px per font px (the HUD counters).
import master from '../../assets-src/palettes/master.json';
import { computeViewport } from '../render/viewport.ts';

const FONT_EM_PX = 8;
const SMALL_FONT_PX = 1.25;
const MEDIUM_FONT_PX = 2;

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
}

/** The UI sizes in CSS px for a `cssW` × `cssH` viewport at `dpr`. */
export function uiScale(cssW: number, cssH: number, dpr: number): UiScale {
  const ratio = Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
  const { scale } = computeViewport(cssW, cssH, ratio);
  // Device px per font px; at scale 1 both round to 2, so the counters take one more to stay larger.
  const small = Math.ceil(scale * SMALL_FONT_PX);
  const medium = Math.max(Math.ceil(scale * MEDIUM_FONT_PX), small + 1);
  return { px: scale / ratio, fontS: (small * FONT_EM_PX) / ratio, fontM: (medium * FONT_EM_PX) / ratio };
}

/** Keeps `--px`, `--font-s` and `--font-m` on `root` in step with the viewport; returns the stop function. */
export function trackScale(root: HTMLElement, win: Window = window): () => void {
  const apply = (): void => {
    const s = uiScale(win.innerWidth, win.innerHeight, win.devicePixelRatio);
    root.style.setProperty('--px', `${String(s.px)}px`);
    root.style.setProperty('--font-s', `${String(s.fontS)}px`);
    root.style.setProperty('--font-m', `${String(s.fontM)}px`);
  };
  apply();
  win.addEventListener('resize', apply);
  return () => {
    win.removeEventListener('resize', apply);
  };
}
