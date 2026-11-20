// Which building a world tap hit (plan M2-13, SPEC §3.3: a tap on a building opens its row; a tap on open ground
// earns). Pure: render builds the targets from the props it draws (frame box + opaque px) and asks with the tapped
// world px; the answer goes to the UI with the tap — render never acts on it beyond the camera.
import type { Plot, PlotBuilding } from '../content/villages/khortytsia.layout.ts';
import { plotShown, type SceneState } from './scene.ts';

/** One drawn prop in world px (ground space: x with the camera, y in rows of the normal frame). */
export interface PlotTarget {
  /** The building whose plot this prop belongs to; none = a plain prop (a tree) that only hides what is behind. */
  readonly plot: Plot | undefined;
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  /** Draw order (the ground layer's zIndex); equal z → the later target is in front (Pixi's stable sort). */
  readonly z: number;
  /** Whether the frame px at (lx, ly) from the box's top-left is drawn. */
  readonly opaque: (lx: number, ly: number) => boolean;
}

export type PlotScene = Pick<SceneState, 'tiers' | 'variants'>;

/** What is drawn at (x, y): the front-most shown target with an opaque px there; `undefined` = nothing. */
function frontAt(order: readonly PlotTarget[], x: number, y: number): PlotTarget | undefined {
  return order.find((t) => {
    const lx = x - t.left;
    const ly = y - t.top;
    return lx >= 0 && ly >= 0 && lx < t.width && ly < t.height && t.opaque(lx, ly);
  });
}

/** Offsets within `slop` px, nearest first (Chebyshev rings; within a ring, straight neighbours before diagonals). */
function offsetsWithin(slop: number): readonly (readonly [number, number])[] {
  const out: [number, number][] = [];
  for (let dy = -slop; dy <= slop; dy += 1) for (let dx = -slop; dx <= slop; dx += 1) out.push([dx, dy]);
  const ring = ([dx, dy]: readonly [number, number]): number => Math.max(Math.abs(dx), Math.abs(dy));
  const d2 = ([dx, dy]: readonly [number, number]): number => dx * dx + dy * dy;
  return out.sort((a, b) => ring(a) - ring(b) || d2(a) - d2(b));
}
const OFFSETS = new Map<number, readonly (readonly [number, number])[]>();

/** The shown targets front to back, kept per target list for the last scene (a tap series reuses it). */
const ORDER = new WeakMap<readonly PlotTarget[], { scene: PlotScene; order: readonly PlotTarget[] }>();
function frontToBack(targets: readonly PlotTarget[], scene: PlotScene): readonly PlotTarget[] {
  const cached = ORDER.get(targets);
  if (cached?.scene === scene) return cached.order;
  const order = targets
    .map((t, i) => ({ t, i }))
    .filter(({ t }) => t.plot === undefined || plotShown(t.plot, scene.tiers, scene.variants))
    .sort((a, b) => b.t.z - a.t.z || b.i - a.i)
    .map(({ t }) => t);
  ORDER.set(targets, { scene, order });
  return order;
}

/**
 * The building drawn at world px `p` (whole px) in `scene`, or `null` (open ground, a tree, the sky). With `slop`, a
 * miss also tries the px around it, nearest first, so a tap on a building's edge still counts.
 */
export function plotAt(
  targets: readonly PlotTarget[],
  p: { readonly x: number; readonly y: number },
  scene: PlotScene,
  slop = 0,
): PlotBuilding | null {
  const order = frontToBack(targets, scene);
  let offsets = OFFSETS.get(slop);
  if (!offsets) {
    offsets = offsetsWithin(slop);
    OFFSETS.set(slop, offsets);
  }
  for (const [dx, dy] of offsets) {
    const hit = frontAt(order, p.x + dx, p.y + dy);
    if (hit) return hit.plot?.building ?? null;
  }
  return null;
}

/**
 * The rows `building` takes on screen (for the sheet reveal, M2-13): from the top of its highest shown part to its
 * lowest ground row (a target's z without the lift's half); `null` when nothing of it is drawn — nothing to reveal.
 */
export function plotSpan(
  targets: readonly PlotTarget[],
  building: PlotBuilding,
  scene: PlotScene,
): { readonly top: number; readonly bottom: number } | null {
  const shown = frontToBack(targets, scene).filter((t) => t.plot?.building === building);
  if (shown.length === 0) return null;
  return { top: Math.min(...shown.map((t) => t.top)), bottom: Math.max(...shown.map((t) => Math.floor(t.z))) };
}
