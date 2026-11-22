// A building's 1-px warm outline in the world (M2-29, art-director M2-15 tails 2–3): while its row is the selected one
// in the sheet (render/scene.ts `marks`, set by App from `WorldApp.mark`), and at night as the new tier's flash (a
// warm rim on the building itself instead of the day star, render/fx/build.ts). Drawn after the grade, so it keeps its
// palette colour at night, yet it hides behind whatever stands in front of the building: per mark one filtered group
// renders the building's sprites shifted by 1 px (four ways for the ring; up and up-left for the night rim), erases
// the sprites themselves and every sprite drawn in front of them (blend `erase`), and a colour matrix paints what is
// left — the ring — one flat colour.
// The ground layer (layers/Ground.ts) picks the sprites: `outlineSets` is the pure part.
import { ColorMatrixFilter, Container, Sprite } from 'pixi.js';
import type { PlotBuilding } from '../../content/villages/khortytsia.layout.ts';

/** One outline this frame: whose, in which colour (0xRRGGBB), how opaque. */
export interface PlotMark {
  readonly building: PlotBuilding;
  readonly color: number;
  readonly alpha: number;
  /** A rim light on the edges facing the light (top, left) instead of a closed ring (the night tier flash). */
  readonly rim?: boolean;
}

export interface Box {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

/** A sprite of the ground layer's sorted props as the outline reads it. */
export interface OutlineItem<T> {
  readonly item: T;
  /** The building whose plot the sprite belongs to; `null` for anything else (people, decoration). */
  readonly building: PlotBuilding | null;
  readonly visible: boolean;
  /** Sort key (drawn after everything with a smaller one). */
  readonly z: number;
  /** Its bounds; read only for sprites that might cover the building. */
  readonly box: () => Box;
}

/**
 * The building's shown sprites (`parts`) and the sprites drawn over them (`occluders`: shown, sorted after the
 * building's backmost part, touching the parts' bounds grown by the 1-px ring). No part shown → nothing to outline.
 */
export function outlineSets<T>(
  items: readonly OutlineItem<T>[],
  building: PlotBuilding,
): { readonly parts: T[]; readonly occluders: T[] } {
  const parts = items.filter((i) => i.visible && i.building === building);
  if (parts.length === 0) return { parts: [], occluders: [] };
  const z = Math.min(...parts.map((p) => p.z));
  const boxes = parts.map((p) => p.box());
  const ring: Box = {
    x0: Math.min(...boxes.map((b) => b.x0)) - 1,
    y0: Math.min(...boxes.map((b) => b.y0)) - 1,
    x1: Math.max(...boxes.map((b) => b.x1)) + 1,
    y1: Math.max(...boxes.map((b) => b.y1)) + 1,
  };
  const occluders = items.filter((i) => {
    if (!i.visible || i.building === building || i.z <= z) return false;
    const b = i.box();
    return b.x0 < ring.x1 && b.x1 > ring.x0 && b.y0 < ring.y1 && b.y1 > ring.y0;
  });
  return { parts: parts.map((p) => p.item), occluders: occluders.map((o) => o.item) };
}

/** The four 1-px shifts of the ring (4-connected: no corner px, a clean pixel-art outline). */
const RING = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;
/** The rim light: only above and up-left of the sprite — its top and left edges (light from the top-left). */
const RIM = [
  [0, -1],
  [-1, -1],
] as const;

export interface Outlines {
  /** Post-grade, at ground parallax (the owner moves it with the camera like the coins). */
  readonly container: Container;
  /** Draws mark slot `slot` around `parts`, cut by `occluders`. */
  draw(
    slot: number,
    parts: readonly Sprite[],
    occluders: readonly Sprite[],
    look: Pick<PlotMark, 'color' | 'alpha' | 'rim'>,
  ): void;
  /** Hides every slot from `slot` on. */
  hideFrom(slot: number): void;
  destroy(): void;
}

export function createOutlines(slots: number): Outlines {
  const container = new Container({ label: 'outlines' });
  const groups = Array.from({ length: slots }, (_, i) => {
    const group = new Container({ label: `outline-${String(i)}` });
    const filter = new ColorMatrixFilter();
    group.filters = [filter];
    group.visible = false;
    container.addChild(group);
    return { group, filter, pool: [] as Sprite[], color: -1, alpha: -1 };
  });
  return {
    container,
    draw(slot, parts, occluders, { color, alpha, rim = false }) {
      const g = groups[slot];
      if (!g) return;
      let used = 0;
      const copy = (from: Sprite, dx: number, dy: number, erase: boolean): void => {
        let s = g.pool[used];
        if (!s) {
          s = new Sprite({ texture: from.texture, roundPixels: true });
          g.pool.push(s);
          g.group.addChild(s);
        }
        used += 1;
        s.visible = true;
        s.texture = from.texture;
        s.anchor.copyFrom(from.anchor);
        s.scale.copyFrom(from.scale);
        s.position.set(from.x + dx, from.y + dy);
        s.blendMode = erase ? 'erase' : 'normal';
      };
      for (const [dx, dy] of rim ? RIM : RING) for (const p of parts) copy(p, dx, dy, false);
      for (const p of parts) copy(p, 0, 0, true);
      for (const o of occluders) copy(o, 0, 0, true);
      for (let i = used; i < g.pool.length; i++) {
        const s = g.pool[i];
        if (s) s.visible = false;
      }
      if (g.color !== color || g.alpha !== alpha) {
        g.color = color;
        g.alpha = alpha;
        // Every px of the group becomes `color` at `alpha` (binary input: the atlas has no soft alpha here). The alpha
        // goes in the matrix, not on the group: a group alpha would halve the erasing sprites too and let the
        // building's own silhouette show through.
        const c = (shift: number): number => ((color >> shift) & 0xff) / 255;
        g.filter.matrix = [0, 0, 0, 0, c(16), 0, 0, 0, 0, c(8), 0, 0, 0, 0, c(0), 0, 0, 0, alpha, 0];
      }
      g.group.visible = used > 0 && alpha > 0;
    },
    hideFrom(slot) {
      for (let i = slot; i < groups.length; i++) {
        const g = groups[i];
        if (g) g.group.visible = false;
      }
    },
    destroy() {
      for (const g of groups) g.group.filters = [];
      container.destroy({ children: true });
    },
  };
}
