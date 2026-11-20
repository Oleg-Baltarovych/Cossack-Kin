// Layer 5 — foreground (parallax 1.2, plan ART-14). Near-camera plant clumps from the scene layout (`plant.<variant>`
// frames of the `khortytsia` atlas), sorted back to front by their ground row. Each frame the wind picks one of the
// baked lean frames (render/sway.ts) — whole-px offsets drawn by the generator, so the grid never breaks — and a clump
// that covers a walker drops to half alpha, so no one is hidden behind the grass. One atlas texture: it batches with
// the ground layer.
import { Sprite, type Texture } from 'pixi.js';
import type { WorldLayout } from '../../content/villages/khortytsia.layout.ts';
import type { AgentSprite } from '../../content/agents.ts';
import { FOREGROUND, SWAY } from '../atmosphere/config.ts';
import { foregroundAlpha, SWAY_UPRIGHT, swayFrame, type Rect } from '../sway.ts';
import type { FrameLookup } from './Ground.ts';
import { createLayer, horizonY, type WorldLayer } from './Layer.ts';

export interface ForegroundLayerOptions {
  readonly layout: WorldLayout;
  readonly frame: FrameLookup;
  readonly lessMotion: boolean;
}

type MutableRect = { -readonly [K in keyof Rect]: Rect[K] };

/** Box of a sprite with `texture` whose anchor sits at (x, y), written into `out`. */
function box(texture: Texture, x: number, y: number, out: MutableRect = { x: 0, y: 0, w: 0, h: 0 }): MutableRect {
  const a = texture.defaultAnchor ?? { x: 0.5, y: 1 };
  out.x = x - a.x * texture.width;
  out.y = y - a.y * texture.height;
  out.w = texture.width;
  out.h = texture.height;
  return out;
}

export function createForegroundLayer({ layout, frame, lessMotion }: ForegroundLayerOptions): WorldLayer {
  return createLayer('foreground', FOREGROUND.parallax, (container) => {
    const plants = [...layout.foreground]
      .sort((a, b) => a.ground - b.ground)
      .map((plant) => {
        const frames = Array.from({ length: SWAY.frames }, (_, i) =>
          frame(`${plant.sprite}/idle/${String(i).padStart(2, '0')}`),
        );
        const sprite = new Sprite({
          texture: frames[SWAY_UPRIGHT] ?? frame(`${plant.sprite}/idle/00`),
          roundPixels: true,
        });
        sprite.anchor.copyFrom(sprite.texture.defaultAnchor ?? { x: 0.5, y: 1 });
        container.addChild(sprite);
        return { plant, frames, sprite };
      });
    /** People's idle frame by sprite stem (their box), and the boxes reused frame to frame. */
    const idleFrames = new Map<AgentSprite, Texture>();
    const idleFrame = (stem: AgentSprite): Texture => {
      const known = idleFrames.get(stem);
      if (known) return known;
      const texture = frame(`${stem}/idle/00`);
      idleFrames.set(stem, texture);
      return texture;
    };
    const boxes: MutableRect[] = [];
    const plantBox: MutableRect = { x: 0, y: 0, w: 0, h: 0 };
    let horizon = 0;

    return {
      resize: (size) => {
        horizon = horizonY(size.viewH);
        for (const { plant, sprite } of plants) sprite.position.set(plant.x, horizon + plant.ground);
      },
      update: ({ agents, ambient, camX, scene }) => {
        // People in this layer's space: the ground scrolls by camX, this layer by camX × parallax.
        const shift = camX * (FOREGROUND.parallax - 1);
        boxes.length = Math.min(boxes.length, agents.length);
        for (const [i, pose] of agents.entries()) {
          boxes[i] = box(idleFrame(pose.sprite), pose.x + shift, horizon + pose.ground, boxes[i]);
        }
        for (const { plant, frames, sprite } of plants) {
          const texture = frames[swayFrame(ambient, plant, scene.wind, lessMotion)];
          if (texture) sprite.texture = texture;
          sprite.alpha = foregroundAlpha(box(sprite.texture, sprite.x, sprite.y, plantBox), boxes);
        }
      },
    };
  });
}
