// Small hand-placed glyphs for the raid map's markers (plan M3-10): px set by role, then a 1-px ink outline around
// every solid px (4-neighbour, never black: ink 1). Tiny items only (art.md «.px masks only for tiny items»).
import type { IndexBuffer, RampName } from './buffer.ts';
import { Plot } from './plot.ts';

export class Glyph {
  readonly solid = new Plot();
  readonly flat = new Plot();

  /** A px that gets the outline around it. */
  set(x: number, y: number, ramp: RampName, shade: number): void {
    this.solid.set(x, y, ramp, shade);
  }

  /** A px drawn after the outline, without one (ground marks, thin strokes). */
  mark(x: number, y: number, ramp: RampName, shade: number): void {
    this.flat.set(x, y, ramp, shade);
  }

  /** Writes the glyph into `buffer`: outline (ink `outline`), the solid px, then the flat marks. */
  draw(buffer: IndexBuffer, outline = 1): void {
    const at = (k: number): readonly [number, number] => [k % 4096, Math.floor(k / 4096)];
    for (const k of this.solid.px.keys()) {
      const [x, y] = at(k);
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const nx = x + dx;
        const ny = y + dy;
        if (!this.solid.has(nx, ny) && buffer.inBounds(nx, ny)) buffer.set(nx, ny, { ramp: 'ink', shade: outline });
      }
    }
    for (const plot of [this.solid, this.flat])
      for (const [k, v] of plot.px) {
        const [x, y] = at(k);
        if (buffer.inBounds(x, y)) buffer.set(x, y, { ramp: v.ramp, shade: v.shade });
      }
  }
}
