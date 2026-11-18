// Horizontal culling for the wide world (plan M2-01): sprites outside the camera's x range are not drawn. Uses
// `renderable` (not `visible`, which the plots own) and only flips it when it changes, so a still camera never
// rebuilds the batch.
import { Sprite, type Container } from 'pixi.js';

/** Whether [left, left + w) overlaps [x0, x1). */
export function overlapsX(left: number, w: number, x0: number, x1: number): boolean {
  return left + w > x0 && left < x1;
}

/** Marks every child sprite of `into` renderable iff it overlaps world x [x0, x1) (container x included). */
export function cullByX(into: Container, x0: number, x1: number): void {
  for (const child of into.children) {
    if (!(child instanceof Sprite)) continue;
    const w = child.texture.orig.width;
    // An anchored sprite (or a mirrored walker) reaches up to a full width either side of its pivot.
    const anchored = child.anchor.x > 0;
    const left = into.x + child.x - (anchored ? w : 0);
    const on = overlapsX(left, anchored ? 2 * w : w, x0, x1);
    if (child.renderable !== on) child.renderable = on;
  }
}
