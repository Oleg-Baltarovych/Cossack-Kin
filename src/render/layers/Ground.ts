// Layer 4 — ground (parallax 1.0, ART-05). Tiled ground rows from the scene layout (content/villages/
// khortytsia.layout.ts, `ground.<tile>` 64×32 frames of the `khortytsia` atlas; grass picks one of its seeded
// variants per tile), then flat decals (yards), then the props' `@shadow` frames, then the props themselves Y-sorted by
// their pivot (SPEC §6.2), then the cloud shadows over everything (ART-07: one tiled overlay scrolling with the wind,
// opacity by time of day), with the scripted walkers (render/walkers.ts) sorted among them and re-posed every frame. All sprites come from one atlas texture, so the
// whole layer is one batch. Night window masks are not here: they live in the post-grade emissive container.
import { Container, Sprite, type Texture } from 'pixi.js';
import type { GroundTile, SceneLayout } from '../../content/villages/khortytsia.layout.ts';
import { CLOUD_SHADOW } from '../atmosphere/config.ts';
import { cloudShadowLevel } from '../atmosphere/emissive.ts';
import { IDLE_FRAMES, WALK_FRAMES, walkerPose } from '../walkers.ts';
import { contentWidth, createLayer, horizonY, type LayerSize, type WorldLayer } from './Layer.ts';

const PARALLAX = 1;
const TILE_W = 64;
const TILE_H = 32;

/** Frame lookup in the scene atlas (`<name>` → texture; throws on a missing frame). */
export type FrameLookup = (name: string) => Texture;

export interface GroundLayerOptions {
  readonly layout: SceneLayout;
  readonly frame: FrameLookup;
}

/** `khata.t1` → base, shadow and emissive frame names (`<entity>[.<variant>][@layer]/idle/00`). */
export function propFrames(sprite: string): { base: string; shadow: string; emissive: string } {
  const [entity = sprite, variant] = sprite.split('.');
  const stem = (layer: string): string => `${entity}${variant ? `.${variant}` : ''}@${layer}/idle/00`;
  return { base: `${sprite}/idle/00`, shadow: stem('shadow'), emissive: stem('emissive') };
}

/** Seeded variants per tile kind (the ground generator's `variants`); one is picked per tile position. */
const TILE_VARIANTS: Readonly<Record<GroundTile, readonly string[]>> = {
  meadow: ['meadow'],
  grass: ['grass', 'grass-b', 'grass-c'],
  path: ['path'],
  earth: ['earth', 'earth-b', 'earth-c'],
  val: ['val'],
  maidan: ['maidan', 'maidan-b', 'maidan-c'],
};

/** Deterministic variant pick for the tile at column `col`, world row `row` (no RNG: same scene, same tiles). */
export function tileFrame(tile: GroundTile, col: number, row: number): string {
  const variants = TILE_VARIANTS[tile];
  let n = Math.imul(col + 1, 374761393) ^ Math.imul(row + 1, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  const pick = variants[((n ^ (n >>> 16)) >>> 0) % variants.length] ?? tile;
  return `ground.${pick}/idle/00`;
}

export function createGroundLayer({ layout, frame }: GroundLayerOptions): WorldLayer {
  return createLayer('ground', PARALLAX, (container) => {
    const tiles = new Container({ label: 'ground-tiles' });
    const decals = new Container({ label: 'decals' });
    const shadows = new Container({ label: 'shadows' });
    const props = new Container({ label: 'props', sortableChildren: true });
    // Cloud shadows: a far strip under the horizon (smaller, slower) and the near tiles below it.
    const cloudShadows = new Container({ label: 'cloud-shadows' });
    const farShadows = new Container({ label: 'cloud-shadows-far' });
    const nearShadows = new Container({ label: 'cloud-shadows-near' });
    cloudShadows.addChild(farShadows, nearShadows);
    container.addChild(tiles, decals, shadows, props, cloudShadows);
    const nearTexture = frame('cloud-shadow/idle/00');
    const farTexture = frame('cloud-shadow-far/idle/00');

    const placedDecals = layout.decals.map((d) => {
      const sprite = new Sprite({ texture: frame(`${d.sprite}/idle/00`), roundPixels: true });
      sprite.anchor.copyFrom(sprite.texture.defaultAnchor ?? { x: 0.5, y: 0.5 });
      decals.addChild(sprite);
      return { decal: d, sprite };
    });

    const placed = layout.props.map((p) => {
      const names = propFrames(p.sprite);
      const sprite = new Sprite({ texture: frame(names.base), roundPixels: true });
      const shadow = new Sprite({ texture: frame(names.shadow), roundPixels: true });
      // Atlas anchors put the pivot at the bottom-centre of the ground row.
      sprite.anchor.copyFrom(sprite.texture.defaultAnchor ?? { x: 0.5, y: 1 });
      shadow.anchor.copyFrom(shadow.texture.defaultAnchor ?? { x: 0.5, y: 1 });
      shadows.addChild(shadow);
      props.addChild(sprite);
      return { prop: p, sprite, shadow };
    });

    const frameList = (stem: string, anim: string, count: number): Texture[] =>
      Array.from({ length: count }, (_, i) => frame(`${stem}/${anim}/${String(i).padStart(2, '0')}`));
    const walkers = layout.walkers.map((w) => {
      const [entity = w.sprite, variant = ''] = w.sprite.split('.');
      const walk = frameList(w.sprite, 'walk', WALK_FRAMES);
      const idle = frameList(w.sprite, 'idle', IDLE_FRAMES);
      const sprite = new Sprite({ texture: frame(`${w.sprite}/idle/00`), roundPixels: true });
      const shadow = new Sprite({ texture: frame(`${entity}.${variant}@shadow/idle/00`), roundPixels: true });
      sprite.anchor.copyFrom(sprite.texture.defaultAnchor ?? { x: 0.5, y: 1 });
      shadow.anchor.copyFrom(shadow.texture.defaultAnchor ?? { x: 0.5, y: 1 });
      shadows.addChild(shadow);
      props.addChild(sprite);
      return { walker: w, walk, idle, sprite, shadow };
    });
    let horizon = 0;

    const resize = (size: LayerSize): void => {
      for (const child of tiles.removeChildren()) child.destroy();
      const width = contentWidth(PARALLAX, size);
      horizon = horizonY(size.viewH);
      const bands = [...layout.rows];
      const last = bands[bands.length - 1];
      const fillTop = last ? last.top + last.h : 0;
      bands.push({ tile: layout.fill, top: fillTop, h: Math.max(0, size.viewH - horizon - fillTop) });
      for (const band of bands) {
        for (let y = 0; y < band.h; y += TILE_H) {
          for (let x = 0; x < width; x += TILE_W) {
            const texture = frame(tileFrame(band.tile, x / TILE_W, (band.top + y) / TILE_H));
            const tile = new Sprite({ texture, roundPixels: true });
            tile.position.set(x, horizon + band.top + y);
            tiles.addChild(tile);
          }
        }
      }
      // The near bank's edge under the river (ART-09): shore tiles right under the last water row.
      if (layout.waterRows > 0) {
        const shoreTexture = frame('shore/idle/00');
        for (let x = 0; x < width; x += shoreTexture.width) {
          const tile = new Sprite({ texture: shoreTexture, roundPixels: true });
          tile.position.set(x, horizon + layout.waterRows);
          tiles.addChild(tile);
        }
      }
      for (const { decal, sprite } of placedDecals) sprite.position.set(decal.x, horizon + decal.ground);
      for (const { prop, sprite, shadow } of placed) {
        const y = horizon + prop.ground;
        sprite.position.set(prop.x, y);
        shadow.position.set(prop.x, y);
        sprite.zIndex = y;
      }
      // Cloud shadows: whole tiles, one spare column for the scroll; the far strip right under the horizon.
      const lay = (into: Container, texture: Texture, top: number, bottom: number): void => {
        for (const child of into.removeChildren()) child.destroy();
        for (let y = top; y < bottom; y += texture.height) {
          for (let x = -texture.width; x < width; x += texture.width) {
            const tile = new Sprite({ texture, roundPixels: true });
            tile.position.set(x, y);
            into.addChild(tile);
          }
        }
      };
      lay(farShadows, farTexture, horizon, horizon + CLOUD_SHADOW.farRows);
      lay(nearShadows, nearTexture, horizon + CLOUD_SHADOW.farRows, size.viewH);
    };

    return {
      resize,
      update: ({ seconds, cycle }) => {
        const level = cloudShadowLevel(cycle);
        cloudShadows.visible = level > 0.01;
        cloudShadows.alpha = CLOUD_SHADOW.alpha * level;
        const scroll = (speed: number, w: number): number => Math.round((((seconds * speed) % w) + w) % w);
        nearShadows.x = scroll(CLOUD_SHADOW.speed, nearTexture.width);
        farShadows.x = scroll(CLOUD_SHADOW.speed * CLOUD_SHADOW.farSpeed, farTexture.width);
        for (const { walker, walk, idle, sprite, shadow } of walkers) {
          const pose = walkerPose(walker, seconds);
          const texture = (pose.anim === 'walk' ? walk : idle)[pose.frame];
          if (texture) sprite.texture = texture;
          const y = horizon + walker.ground;
          sprite.position.set(pose.x, y);
          shadow.position.set(pose.x, y);
          // Mirrored about the pivot column; the anchor keeps the feet on the same px.
          sprite.scale.x = pose.facing;
          sprite.zIndex = y;
        }
      },
    };
  });
}
