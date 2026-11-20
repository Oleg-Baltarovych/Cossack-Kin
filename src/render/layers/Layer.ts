// World layer contract (SPEC §6.2). Each layer owns one Container inside worldRT.
import { Container } from 'pixi.js';
import { FRAMING } from '../atmosphere/config.ts';
import { horizonRow } from '../camera.ts';
import type { DayCycle } from '../atmosphere/dayCycle.ts';
import type { SceneState } from '../scene.ts';
import type { Quality } from '../settings.ts';
import type { AgentPose } from '../agents/sim.ts';

export type LayerId = 'sky' | 'clouds' | 'far' | 'mid' | 'ground' | 'foreground' | 'fx' | 'light';

/** Sizes in logical px. `viewW`/`viewH` are the worldRT size (visible columns/rows + 1 spare). */
export interface LayerSize {
  readonly viewW: number;
  readonly viewH: number;
  readonly worldW: number;
}

/** Per-frame input (App ticker, before the world render). */
export interface LayerFrame {
  /** Time of day in minutes after midnight (fractional). */
  readonly minutes: number;
  /** Animation time in seconds (pinned under `?freeze`): people walk on it. */
  readonly seconds: number;
  /** The agents' poses this frame (render/agents/, stepped on `seconds`), in pool order. */
  readonly agents: readonly AgentPose[];
  /**
   * Time for atmospheric motion — clouds, water, sails, sway, fire, rain, stars, particles (ART-18): `seconds`, or 0
   * under «менше руху» (a still frame).
   */
  readonly ambient: number;
  readonly cycle: DayCycle;
  /** Camera position in world px (ground parallax); screen-fixed layers use it to place parallax content. */
  readonly camX: number;
  /**
   * The camera is being dragged, coasting or gliding (M2-02): costly camera-dependent repaints may run at their own
   * rate and catch up once it settles.
   */
  readonly cameraMoving: boolean;
  /** Real frame time in ms (`performance.now()`), for rate limits that must also tick under `?freeze`. */
  readonly nowMs: number;
  /** What the game puts in the scene (render/scene.ts): plots by building tier, the wind. */
  readonly scene: SceneState;
  /**
   * Rows the sky band is moved down at the closer zoom level so the sun/moon stays in the window (camera.ts `skyShift`;
   * 0 at the normal level). Anything aimed at the disc (light shafts) adds it to the disc row.
   */
  readonly skyY: number;
}

export interface WorldLayer {
  readonly id: LayerId;
  /** Horizontal parallax factor relative to the ground (1.0). */
  readonly parallax: number;
  readonly container: Container;
  resize(size: LayerSize): void;
  update(frame: LayerFrame): void;
  /** Applies a quality tier (ART-18; also after the auto-detect picks one). */
  setQuality(quality: Quality): void;
  destroy(): void;
}

export interface LayerHooks {
  readonly resize?: (size: LayerSize) => void;
  readonly update?: (frame: LayerFrame) => void;
  readonly setQuality?: (quality: Quality) => void;
  /** Frees what the container does not own (textures created by the layer); runs before the container is destroyed. */
  readonly dispose?: () => void;
}

/** Builds the layer's display objects into `container`; returns its resize handler or its hooks. */
export type LayerBuild = (container: Container) => ((size: LayerSize) => void) | LayerHooks | undefined;

export interface LayerOptions {
  readonly sortableChildren?: boolean;
}

/**
 * The single way to make a layer: stubs pass no `build`. Destroying the layer destroys its container and
 * every child, so the world container needs no separate child cleanup.
 */
export function createLayer(id: LayerId, parallax: number, build?: LayerBuild, options: LayerOptions = {}): WorldLayer {
  const container = new Container({ label: `layer:${id}`, sortableChildren: options.sortableChildren ?? false });
  const built = build?.(container);
  const hooks: LayerHooks = typeof built === 'function' ? { resize: built } : (built ?? {});
  return {
    id,
    parallax,
    container,
    resize: (size) => {
      hooks.resize?.(size);
    },
    update: (frame) => {
      hooks.update?.(frame);
    },
    setQuality: (quality) => {
      hooks.setQuality?.(quality);
    },
    destroy: () => {
      hooks.dispose?.();
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

/** Horizon row of the frame (default framing, ART-BIBLE §2): sky above, ground rows below. */
export function horizonY(viewH: number): number {
  return horizonRow(viewH, FRAMING);
}
