// Layer 5 — foreground (parallax 1.2, plan ART-14). Near-camera plant clumps from the scene layout (`plant.<variant>`
// frames of the `khortytsia` atlas), sorted back to front by their ground row. Each frame the wind picks one of the
// baked lean frames (render/sway.ts) — whole-px offsets drawn by the generator, so the grid never breaks — and a clump
// that covers a walker drops to half alpha, so no one is hidden behind the grass. One atlas texture: it batches with
// the ground layer.
import { Sprite, type Texture } from 'pixi.js';
import type { SceneLayout } from '../../content/villages/khortytsia.layout.ts';
import { FOREGROUND, SWAY } from '../atmosphere/config.ts';
import { foregroundAlpha, SWAY_UPRIGHT, swayFrame, type Rect } from '../sway.ts';
import { walkerPose } from '../walkers.ts';
import type { FrameLookup } from './Ground.ts';
import { createLayer, horizonY, type WorldLayer } from './Layer.ts';

export interface ForegroundLayerOptions {
  readonly layout: SceneLayout;
  readonly frame: FrameLookup;
  readonly lessMotion: boolean;
}

/** Box of a sprite with `texture` whose anchor sits at (x, y). */
function box(texture: Texture, x: number, y: number): Rect {
  const a = texture.defaultAnchor ?? { x: 0.5, y: 1 };
  return { x: x - a.x * texture.width, y: y - a.y * texture.height, w: texture.width, h: texture.height };
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
    const walkerTextures = layout.walkers.map((w) => frame(`${w.sprite}/idle/00`));
    let horizon = 0;

    return {
      resize: (size) => {
        horizon = horizonY(size.viewH);
        for (const { plant, sprite } of plants) sprite.position.set(plant.x, horizon + plant.ground);
      },
      update: ({ seconds, ambient, camX, scene }) => {
        // Walkers in this layer's space: the ground scrolls by camX, this layer by camX × parallax.
        const shift = camX * (FOREGROUND.parallax - 1);
        const people = layout.walkers.flatMap((w, i) => {
          const texture = walkerTextures[i];
          return texture ? [box(texture, walkerPose(w, seconds).x + shift, horizon + w.ground)] : [];
        });
        for (const { plant, frames, sprite } of plants) {
          const texture = frames[swayFrame(ambient, plant, scene.wind, lessMotion)];
          if (texture) sprite.texture = texture;
          sprite.alpha = foregroundAlpha(box(sprite.texture, sprite.x, sprite.y), people);
        }
      },
    };
  });
}
