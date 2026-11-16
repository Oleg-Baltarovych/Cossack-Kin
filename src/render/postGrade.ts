// Post-grade world content (ART-04/05): drawn into worldRT after the LUT-graded container, at ground parallax.
// - `emissive`: night masks (`<entity>@emissive` frames: windows; forge and fire later) at the props' positions,
//   composited after grading so light sources keep their colour instead of being darkened by the night LUT.
//   Opacity follows `emissiveLevel(dayCycle)`: off by day, partial at golden hour, on at dusk and night.
// - dev/test only: the `debug/swatch` (M0-08) at the bottom-left, under the future bottom sheet and away from the
//   scene. Ungraded, so every palette color reaches the canvas unchanged (the @screens swatch check).
import { Container, Sprite, type Texture } from 'pixi.js';
import type { SceneLayout } from '../content/villages/khortytsia.layout.ts';
import { propFrames } from './layers/Ground.ts';
import { horizonY, type LayerSize } from './layers/Layer.ts';

/** Left edge of the swatch in logical px (visible at camera 0 on every M0 phone). */
const SWATCH_X = 12;
/** Swatch pivot (bottom) this many rows above the bottom of the view. */
const SWATCH_BOTTOM_MARGIN = 6;

export interface PostGradeOptions {
  readonly layout: SceneLayout;
  /** Frame lookup in the scene atlas; `null` when the frame does not exist (props without a night mask). */
  readonly frame: (name: string) => Texture | null;
  readonly swatch?: Texture | undefined;
}

export interface PostGrade {
  readonly container: Container;
  readonly emissive: Container;
  readonly parallax: number;
  resize(size: LayerSize): void;
  /** 0..1 emissive opacity. */
  setEmissive(level: number): void;
}

export function createPostGrade({ layout, frame, swatch }: PostGradeOptions): PostGrade {
  const container = new Container({ label: 'post-grade' });
  const emissive = new Container({ label: 'emissive' });
  container.addChild(emissive);
  const masks = layout.props.flatMap((prop) => {
    const texture = frame(propFrames(prop.sprite).emissive);
    if (!texture) return [];
    const sprite = new Sprite({ texture, roundPixels: true });
    emissive.addChild(sprite);
    return [{ prop, sprite }];
  });
  const debugSwatch = swatch ? new Sprite({ texture: swatch, roundPixels: true }) : null;
  if (debugSwatch) container.addChild(debugSwatch);
  return {
    container,
    emissive,
    parallax: 1,
    resize: (size) => {
      const horizon = horizonY(size.viewH);
      for (const { prop, sprite } of masks) sprite.position.set(prop.x, horizon + prop.ground);
      // Whole px: anchor.x · width is an integer for the even-width swatch, so the left edge is SWATCH_X.
      debugSwatch?.position.set(
        SWATCH_X + Math.round(debugSwatch.anchor.x * debugSwatch.width),
        size.viewH - SWATCH_BOTTOM_MARGIN,
      );
    },
    setEmissive: (level) => {
      emissive.visible = level > 0.01;
      emissive.alpha = Math.min(1, Math.max(0, level));
    },
  };
}
