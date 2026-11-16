// Shelf packer for sprite atlases (plan M0-08). Deterministic: frames are sorted by height, width, id, so the
// layout depends only on the set of frames, never on input order.

export interface PackRect {
  readonly id: string;
  readonly w: number;
  readonly h: number;
}

export interface Placement extends PackRect {
  readonly x: number;
  readonly y: number;
}

export interface Packed {
  readonly width: number;
  readonly height: number;
  /** Sorted by id. */
  readonly placements: readonly Placement[];
}

export interface PackOptions {
  /** Atlas side limit in px (SPEC §12.4: ≤ 2048). */
  readonly maxSize: number;
  /** Empty px between frames. */
  readonly padding: number;
}

const MIN_WIDTH = 64;

/**
 * Packs rects into shelves. Tries power-of-two shelf widths from the smallest that fits the widest frame and
 * keeps the first whose height is ≤ the width (close to square); the atlas is cropped to the used area.
 */
export function packShelves(rects: readonly PackRect[], options: PackOptions): Packed {
  const { maxSize, padding } = options;
  const sorted = [...rects].sort((a, b) => b.h - a.h || b.w - a.w || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const widest = Math.max(1, ...rects.map((r) => r.w));
  let width = MIN_WIDTH;
  while (width < widest) width *= 2;
  for (; width <= maxSize; width *= 2) {
    const packed = shelves(sorted, Math.min(width, maxSize), padding);
    if (packed.height <= Math.min(width, maxSize)) return packed;
  }
  throw new Error(`atlas: ${String(rects.length)} frame(s) do not fit into ${String(maxSize)}×${String(maxSize)}`);
}

function shelves(sorted: readonly PackRect[], limit: number, padding: number): Packed {
  const placements: Placement[] = [];
  let x = 0;
  let y = 0;
  let shelfH = 0;
  let usedW = 0;
  for (const r of sorted) {
    if (x > 0 && x + r.w > limit) {
      y += shelfH + padding;
      x = 0;
      shelfH = 0;
    }
    placements.push({ ...r, x, y });
    usedW = Math.max(usedW, x + r.w);
    shelfH = Math.max(shelfH, r.h);
    x += r.w + padding;
  }
  placements.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { width: Math.max(1, usedW), height: Math.max(1, y + shelfH), placements };
}
