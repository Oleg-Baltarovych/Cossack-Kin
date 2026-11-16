// World layer contract (SPEC §6.2). Each layer owns one Container inside worldRT.
import { Container } from 'pixi.js';

export type LayerId = 'sky' | 'clouds' | 'far' | 'mid' | 'ground' | 'foreground' | 'fx' | 'light';

/** Sizes in logical px. `viewW`/`viewH` are the worldRT size (visible columns/rows + 1 spare). */
export interface LayerSize {
  readonly viewW: number;
  readonly viewH: number;
  readonly worldW: number;
}

export interface WorldLayer {
  readonly id: LayerId;
  /** Horizontal parallax factor relative to the ground (1.0). */
  readonly parallax: number;
  readonly container: Container;
  resize(size: LayerSize): void;
  destroy(): void;
}

/** Builds the layer's display objects into `container`; returns its resize handler (if it has one). */
export type LayerBuild = (container: Container) => ((size: LayerSize) => void) | undefined;

export interface LayerOptions {
  readonly sortableChildren?: boolean;
}

/**
 * The single way to make a layer: stubs pass no `build`. Destroying the layer destroys its container and
 * every child, so the world container needs no separate child cleanup.
 */
export function createLayer(id: LayerId, parallax: number, build?: LayerBuild, options: LayerOptions = {}): WorldLayer {
  const container = new Container({ label: `layer:${id}`, sortableChildren: options.sortableChildren ?? false });
  const resize = build?.(container);
  return {
    id,
    parallax,
    container,
    resize: (size) => {
      resize?.(size);
    },
    destroy: () => {
      container.destroy({ children: true });
    },
  };
}

/**
 * Width (logical px) a layer with `parallax` must cover so the view never runs past its content:
 * the camera moves the layer by up to (worldW − viewW)·p, plus one view width →
 * worldW·p + viewW·(1 − p). Sky (p = 0) = view width, ground (p = 1) = world width.
 */
export function contentWidth(parallax: number, size: LayerSize): number {
  // −1e-9: float noise (720·1.2 = 864.0000000000001) must not add a whole column.
  return Math.ceil(size.worldW * parallax + size.viewW * (1 - parallax) - 1e-9);
}

/** Temporary M0 horizon: sky above, ground strip below (replaced by the scene layout in ART-05). */
export const HORIZON_RATIO = 0.68;

export function horizonY(viewH: number): number {
  return Math.round(viewH * HORIZON_RATIO);
}
