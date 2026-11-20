// Post-grade world content (ART-04/05/16): drawn into worldRT after the LUT-graded container, at ground parallax.
// - `emissive`: night masks (`<entity>@emissive` frames: windows, the campfire's flames) at the props' positions,
//   composited after grading so light sources keep their colour instead of being darkened by the night LUT. Props
//   with a `cycle` animation cycle their emissive frames too (the fire, 6 frames); the campfire also throws 1-px
//   sparks (atmosphere/nightLights.ts). Opacity follows `emissiveLevel(dayCycle)`: off by day, partial at golden
//   hour, on at dusk and night.
// - dev/test only: the `debug/swatch` (M0-08) at the bottom-left, under the future bottom sheet and away from the
//   scene. Ungraded, so every palette color reaches the canvas unchanged (the @screens swatch check).
import { Container, Sprite, Texture } from 'pixi.js';
import type { WorldLayout } from '../content/villages/khortytsia.layout.ts';
import { plotShown, type SceneState } from './scene.ts';
import { FIRE, QUALITY_TIERS } from './atmosphere/config.ts';
import { sparks } from './atmosphere/nightLights.ts';
import { claimParticles } from './fx/registry.ts';
import type { Quality } from './settings.ts';
import { propFrames } from './layers/Ground.ts';
import { horizonY, type LayerSize } from './layers/Layer.ts';
import type { AgentPose } from './agents/sim.ts';
import { GUARD_ANIMS, GUARD_SPRITES } from '../content/agents.ts';
import { rampColor } from './palette.ts';

/** Left edge of the swatch in logical px (visible at camera 0 on every M0 phone). */
const SWATCH_X = 12;
/** Swatch pivot (bottom) this many rows above the bottom of the view. */
const SWATCH_BOTTOM_MARGIN = 6;
/** Sparks rise from this many rows above the campfire's pivot (the top of the logs). */
const FIRE_TOP = 6;

export interface PostGradeOptions {
  readonly layout: WorldLayout;
  /** Frame lookup in the scene atlas; `null` when the frame does not exist (props without a night mask). */
  readonly frame: (name: string) => Texture | null;
  readonly swatch?: Texture | undefined;
  readonly quality: Quality;
  /** «Менше руху»: no sparks (the flame holds one frame through the still `ambient` time). */
  readonly lessMotion: boolean;
}

export interface PostGrade {
  readonly container: Container;
  readonly emissive: Container;
  readonly parallax: number;
  resize(size: LayerSize): void;
  /** 0..1 emissive opacity. */
  setEmissive(level: number): void;
  /** Cycles animated emissive frames and moves the sparks (ambient seconds, 0 under «менше руху»); hides the night
   * masks of props whose plot is empty (M1-19); lays the guards' torch flames over their poses (M2-19). */
  update(seconds: number, scene: SceneState, agents: readonly AgentPose[]): void;
  /** Sparks per fire by tier (ART-18). */
  setQuality(quality: Quality): void;
  destroy(): void;
}

export function createPostGrade({ layout, frame, swatch, quality, lessMotion }: PostGradeOptions): PostGrade {
  const container = new Container({ label: 'post-grade' });
  const emissive = new Container({ label: 'emissive' });
  container.addChild(emissive);
  const masks = layout.props.flatMap((prop) => {
    const stem = propFrames(prop.sprite).emissive.replace(/\/idle\/00$/, '');
    const a = prop.animate;
    const count = a?.kind === 'cycle' ? a.frames : 1;
    const frames = Array.from({ length: count }, (_, i) => frame(`${stem}/idle/${String(i).padStart(2, '0')}`));
    const first = frames[0];
    if (!first) return [];
    const sprite = new Sprite({ texture: first, roundPixels: true });
    sprite.anchor.copyFrom(first.defaultAnchor ?? { x: 0.5, y: 1 });
    emissive.addChild(sprite);
    const fps = a?.kind === 'cycle' && typeof a.fps === 'number' ? a.fps : 0;
    return [{ prop, sprite, frames: frames.filter((f): f is Texture => f !== null), fps }];
  });
  const fires = layout.props.filter((p) => p.sprite === 'campfire');
  const sparkColor = rampColor(...FIRE.spark);
  const sparkSprites = fires.map(() =>
    Array.from({ length: FIRE.sparks }, () => {
      const s = new Sprite({ texture: Texture.WHITE, roundPixels: true });
      s.tint = sparkColor;
      s.visible = false;
      emissive.addChild(s);
      return s;
    }),
  );
  // Guards' torch flames (M2-19): the `<guard>@emissive/torch/NN` frame over each pose holding a torch, looked up once
  // per guard sprite at creation (no names built per frame); sprites made on first need and reused; mirrored with the
  // guard about the same pivot.
  const torchFrames = new Map<string, readonly (Texture | null)[]>(
    GUARD_SPRITES.map((g) => [
      g,
      Array.from({ length: GUARD_ANIMS.torch.frames }, (_, i) =>
        frame(`${g}@emissive/torch/${String(i).padStart(2, '0')}`),
      ),
    ]),
  );
  const torchSprites: Sprite[] = [];
  const torchFrame = (sprite: string, index: number): Texture | null => torchFrames.get(sprite)?.[index] ?? null;
  const claim = claimParticles();
  let sparkLimit = 0;
  const setQuality = (q: Quality): void => {
    sparkLimit = lessMotion ? 0 : Math.min(FIRE.sparks, QUALITY_TIERS[q].sparks);
    claim.set(fires.length * sparkLimit);
  };
  setQuality(quality);
  let horizon = 0;
  const debugSwatch = swatch ? new Sprite({ texture: swatch, roundPixels: true }) : null;
  if (debugSwatch) container.addChild(debugSwatch);
  return {
    container,
    emissive,
    parallax: 1,
    resize: (size) => {
      horizon = horizonY(size.viewH);
      for (const { prop, sprite } of masks) sprite.position.set(prop.x, horizon + prop.ground - (prop.lift ?? 0));
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
    update: (seconds, scene, agents) => {
      if (!emissive.visible) return;
      let lit = 0;
      for (const pose of agents) {
        if (pose.anim !== 'torch') continue;
        const texture = torchFrame(pose.sprite, pose.frame);
        if (!texture) continue;
        let s = torchSprites[lit];
        if (!s) {
          s = new Sprite({ texture, roundPixels: true });
          emissive.addChild(s);
          torchSprites[lit] = s;
        }
        lit += 1;
        s.texture = texture;
        s.anchor.copyFrom(texture.defaultAnchor ?? { x: 0.5, y: 1 });
        s.visible = true;
        s.position.set(pose.x, horizon + pose.ground);
        s.scale.x = pose.facing;
      }
      for (let i = lit; i < torchSprites.length; i++) {
        const s = torchSprites[i];
        if (s) s.visible = false;
      }
      for (const { prop, sprite, frames, fps } of masks) {
        sprite.visible = plotShown(prop.plot, scene.tiers, scene.variants);
        if (frames.length < 2 || fps <= 0) continue;
        const texture = frames[Math.floor(seconds * fps) % frames.length];
        if (texture) sprite.texture = texture;
      }
      fires.forEach((fire, f) => {
        // A fire whose plot is empty (the second fire before maidan IV) throws no sparks (M2-19 review: an orphan
        // spark trail over the empty maidan).
        const lit = plotShown(fire.plot, scene.tiers, scene.variants);
        const list = lit ? sparks(seconds, { x: fire.x, y: horizon + fire.ground - FIRE_TOP }) : [];
        sparkSprites[f]?.forEach((s, i) => {
          const spark = list[i];
          s.visible = spark !== undefined && i < sparkLimit;
          if (spark) s.position.set(spark.x, spark.y);
        });
      });
    },
    setQuality,
    destroy: () => {
      claim.release();
      container.destroy({ children: true });
    },
  };
}
