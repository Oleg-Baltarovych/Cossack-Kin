// Construction and tier juice (plan M2-12, Q5; SPEC §6.5 «будівництво», §6.7 juice): what a new building and a new
// tier look like, frame by frame, as pure functions of the ms since the event (real time, so `?freeze` shots step with
// Playwright's clock). Cosmetic only: the level is already in the state when this starts — render/bridge.ts merely
// reacts to `BuildingUpgraded` 0 → 1 and `TierReached`. Seeded hashes (no Math.random), whole px.
// The builders knock as each scaffold stage goes up (`knocksBetween`, M2-18): a hook for the audio (M7).
import { BUILD } from '../atmosphere/config.ts';

/** The scaffold stands this long (3 stages) before the building is revealed. */
export const SCAFFOLD_MS = BUILD.stageMs * 3;
/** Standard (стяг) frames: the cloth hoisted up the pole, the last one flying at the top. */
export const STANDARD_FRAMES = 6;

export type BuildFrame =
  /** The building is hidden behind the scaffold of `stage` (0 posts, 1 ledgers and braces, 2 decks and ladder). */
  | { readonly kind: 'scaffold'; readonly stage: 0 | 1 | 2 }
  /** The building stands, drawn at `scale` (the pop); the confetti burst is `burstMs` old. */
  | { readonly kind: 'reveal'; readonly scale: number; readonly burstMs: number }
  | { readonly kind: 'done' };

export function buildFrame(ms: number, lessMotion: boolean): BuildFrame {
  if (ms < SCAFFOLD_MS) {
    const stage = Math.max(0, Math.floor(ms / BUILD.stageMs));
    return { kind: 'scaffold', stage: stage === 0 ? 0 : stage === 1 ? 1 : 2 };
  }
  const burstMs = ms - SCAFFOLD_MS;
  if (lessMotion || burstMs >= BUILD.confettiMs) return { kind: 'done' };
  // 1 → peak → 1: a parabola over the pop (no trig: frames repeat on every engine).
  const t = burstMs / BUILD.popMs;
  const scale = t < 1 ? 1 + (BUILD.popPeak - 1) * 4 * t * (1 - t) : 1;
  return { kind: 'reveal', scale, burstMs };
}

/** The pop's drawn size: whole px (Q5 — rows and columns repeat under nearest sampling, the grid stays whole). */
export function popSize(w: number, h: number, scale: number): { w: number; h: number } {
  return { w: Math.max(w, Math.round(w * scale)), h: Math.max(h, Math.round(h * scale)) };
}

/** Which scaffold a building's base frame takes: `l` for a house or a mill, `s` for a low plot. */
export function scaffoldSize(w: number, h: number): 's' | 'l' {
  return h >= BUILD.largeMinH && h >= w * BUILD.largeMinRatio ? 'l' : 's';
}

/**
 * How many `l` scaffolds stand side by side over a building `w` px wide (art-director M2-29 B4: one 56-px scaffold hid
 * a 104-px kurin, which then doubled on the pop): one per scaffold width of its drawn body (`bayFill` of the padded
 * frame). A low plot (`s`) keeps one: a field is not scaffolded across.
 */
export function scaffoldBays(w: number, size: 's' | 'l'): number {
  return size === 's' ? 1 : Math.max(1, Math.round((w * BUILD.bayFill) / BUILD.scaffoldW.l));
}

/** A point in world px (ground space) and the seed that desyncs one site from another. */
export interface FxSite {
  readonly x: number;
  readonly y: number;
  readonly seed: number;
}

/** A piece of confetti or a dust puff: its frame's pivot (centre / bottom centre), whole px. */
export interface FxPiece {
  readonly x: number;
  readonly y: number;
  readonly frame: number;
}

/** Integer hash → 0..1. */
function hash(a: number, b: number): number {
  let h = Math.imul(a + 1, 374761393) + Math.imul(b + 1, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Symmetric whole-px rounding. */
const px = (v: number): number => Math.sign(v) * Math.round(Math.abs(v));

/** The confetti burst `ms` after the pop: thrown up and out from `site`, falling back; none once it is over. */
export function confettiPieces(site: FxSite, ms: number): FxPiece[] {
  if (ms < 0 || ms >= BUILD.confettiMs) return [];
  const t = ms / 1000;
  return Array.from({ length: BUILD.confetti }, (_, i) => {
    // Every other piece to the other side, so the burst is never lopsided.
    const side = (i % 2 === 0 ? 1 : -1) * (0.2 + 0.8 * hash(i, site.seed));
    const up = BUILD.confettiUp + BUILD.confettiJitter * (hash(site.seed, i * 7 + 3) * 2 - 1);
    // Paper drifts: the sideways speed fades over the burst.
    const dx = BUILD.confettiSide * side * t * (1 - (0.5 * ms) / BUILD.confettiMs);
    const dy = -up * t + 0.5 * BUILD.gravity * t * t;
    const frame = (i + Math.floor(t * BUILD.confettiFlipFps)) % 4;
    return { x: site.x + px(dx), y: site.y + Math.round(dy), frame };
  });
}

/** Dust at the foot of a scaffold `width` px wide, `ms` into the build: `BUILD.dust` staggered puffs rising a little. */
export function dustPuffs(site: FxSite, ms: number, width: number): FxPiece[] {
  const half = Math.floor(width / 2);
  return Array.from({ length: BUILD.dust }, (_, i) => {
    const cycle = ms / BUILD.dustLife + i / BUILD.dust + hash(site.seed, i);
    const gen = Math.floor(cycle);
    const age = cycle - gen;
    // Each new puff kicks up somewhere else along the foot.
    const dx = Math.round((hash(i * 13 + gen, site.seed) * 2 - 1) * half);
    const frame = age < 1 / 3 ? 0 : age < 2 / 3 ? 1 : 2;
    return { x: site.x + dx, y: site.y - Math.round(BUILD.dustRise * age), frame };
  });
}

export type CelebrationFrame =
  /** `flash` frame or none; `standard` frame 0 … 5 (5 = flying at the top). */
  { readonly kind: 'on'; readonly flash: 0 | 1 | 2 | null; readonly standard: number } | { readonly kind: 'done' };

export function celebrationFrame(ms: number, lessMotion: boolean): CelebrationFrame {
  if (ms >= BUILD.celebrationMs) return { kind: 'done' };
  const at = Math.max(0, ms);
  const last = STANDARD_FRAMES - 1;
  if (lessMotion) return { kind: 'on', flash: null, standard: last };
  // A short spark, the long burst, the fading ring (art-director M2-12: the burst frame holds longest).
  const t = at / BUILD.flashMs;
  const flash = t < 0.25 ? 0 : t < 0.7 ? 1 : t < 1 ? 2 : null;
  return { kind: 'on', flash, standard: Math.min(last, Math.floor((at * BUILD.standardFps) / 1000)) };
}

/** When a tier celebration starts: at `now`, or when the same building's running construction reveals it. */
export function celebrationStart(now: number, constructionStart: number | null): number {
  return constructionStart === null ? now : Math.max(now, constructionStart + SCAFFOLD_MS);
}

/** Scaffold stages that went up in (`fromMs`, `toMs`] since the build began (their starts: 0, stageMs, 2·stageMs). */
export function knocksBetween(fromMs: number, toMs: number): number {
  let n = 0;
  for (let stage = 0; stage < 3; stage++) {
    const at = stage * BUILD.stageMs;
    if (fromMs < at && at <= toMs) n += 1;
  }
  return n;
}
