// The hit-test targets of the world's props (plan M2-13): every prop the ground layer draws, as a frame box in world px
// with its opaque px read lazily from the atlas image (once per frame texture, on the first tap that reaches it; the
// masks outlive a resize). The pure decision is render/plotHit.ts; this module only measures what is drawn.
import { ImageSource, type Texture } from 'pixi.js';
import type { Prop, WorldLayout } from '../content/villages/khortytsia.layout.ts';
import type { PlotTarget } from './plotHit.ts';

/** Whether the frame px at (lx, ly) from its top-left is drawn. */
export type FrameMask = (lx: number, ly: number) => boolean;

type Drawable = ImageBitmap | HTMLCanvasElement | HTMLImageElement | OffscreenCanvas;

function drawable(texture: Texture): Drawable | null {
  const source = texture.source;
  if (!(source instanceof ImageSource)) return null;
  const r: unknown = source.resource;
  const ok =
    (typeof ImageBitmap !== 'undefined' && r instanceof ImageBitmap) ||
    (typeof HTMLCanvasElement !== 'undefined' && r instanceof HTMLCanvasElement) ||
    (typeof HTMLImageElement !== 'undefined' && r instanceof HTMLImageElement) ||
    (typeof OffscreenCanvas !== 'undefined' && r instanceof OffscreenCanvas);
  return ok ? r : null;
}

const SOLID: FrameMask = () => true;

/**
 * Opaque px of a frame (alpha > 0) as a bit grid. A frame whose pixels cannot be read (no image source, no 2D canvas)
 * counts as solid — its whole box taps the building — and says so in dev/test builds.
 */
function readMask(texture: Texture): FrameMask {
  const { x, y } = texture.frame;
  const w = Math.round(texture.frame.width);
  const h = Math.round(texture.frame.height);
  const image = drawable(texture);
  const canvas = image && typeof document !== 'undefined' ? document.createElement('canvas') : null;
  const ctx = canvas?.getContext('2d', { willReadFrequently: true }) ?? null;
  if (!image || !canvas || !ctx || w <= 0 || h <= 0) {
    if (__CK_DEBUG__)
      console.warn('plotTargets: frame %s has no readable pixels; its box counts as solid', texture.label);
    return SOLID;
  }
  canvas.width = w;
  canvas.height = h;
  ctx.drawImage(image, x, y, w, h, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h).data;
  const bits = new Uint8Array(w * h);
  for (let i = 0; i < bits.length; i += 1) bits[i] = (data[i * 4 + 3] ?? 0) > 0 ? 1 : 0;
  return (lx, ly) => bits[Math.floor(ly) * w + Math.floor(lx)] === 1;
}

const MASKS = new WeakMap<Texture, FrameMask>();

/** The frame's mask, read once per texture for the app's life (shared by every rebuild of the targets). */
export function atlasMask(texture: Texture): FrameMask {
  let mask = MASKS.get(texture);
  if (!mask) {
    mask = readMask(texture);
    MASKS.set(texture, mask);
  }
  return mask;
}

/**
 * Targets for `layout.props` at the ground layer's placement (`horizon` = its horizon row): pivot at (x, horizon +
 * ground − lift) by the frame's atlas anchor, whole px like the sprite (`roundPixels`), sorted like the layer (zIndex =
 * ground row, + 0.5 when lifted). `frame` gives the texture a prop shows (animated props: their first frame — sails
 * turn about the hub, close enough for a tap); `mask` is read only when a tap reaches the box.
 */
export function propTargets(
  layout: Pick<WorldLayout, 'props'>,
  horizon: number,
  frame: (prop: Prop) => Texture,
  mask: (texture: Texture) => FrameMask = atlasMask,
): PlotTarget[] {
  return layout.props.map((p) => {
    const texture = frame(p);
    const anchor = texture.defaultAnchor ?? { x: 0.5, y: 1 };
    const width = Math.round(texture.frame.width);
    const height = Math.round(texture.frame.height);
    const y = horizon + p.ground;
    return {
      plot: p.plot,
      left: Math.round(p.x - anchor.x * width),
      top: Math.round(y - (p.lift ?? 0) - anchor.y * height),
      width,
      height,
      z: y + (p.lift ? 0.5 : 0),
      opaque: (lx, ly) => mask(texture)(lx, ly),
    };
  });
}
