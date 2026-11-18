// Layer 4 — ground (parallax 1.0, ART-05). Tiled ground rows from the scene layout (content/villages/
// khortytsia.layout.ts, `ground.<tile>` 64×32 frames of the `khortytsia` atlas; grass picks one of its seeded
// variants per tile), then flat decals (yards), then the props' `@shadow` frames, then the props themselves Y-sorted by
// their pivot (SPEC §6.2), then the cloud shadows over everything (ART-07: one tiled overlay scrolling with the wind,
// opacity by time of day), with the scripted walkers (render/walkers.ts) sorted among them and re-posed every frame. All sprites come from one atlas texture, so the
// whole layer is one batch. Night window masks are not here: they live in the post-grade emissive container.
import { Container, Sprite, type Texture } from 'pixi.js';
import type { GroundTile, SceneLayout } from '../../content/villages/khortytsia.layout.ts';
import { CLOUD_SHADOW, QUALITY_TIERS, sailFps, SWAY } from '../atmosphere/config.ts';
import { plotShown } from '../scene.ts';
import { cloudShadowLevel } from '../atmosphere/emissive.ts';
import type { Quality, Weather } from '../settings.ts';
import { swayFrame } from '../sway.ts';
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
  /** «Менше руху»: swaying props stand upright. */
  readonly lessMotion: boolean;
  /** Under rain or fog there is no direct sun, so no cloud shadows (ART-17). */
  readonly weather: Weather;
  /** Cloud shadows by tier (ART-18); `null` = auto, starts at med. */
  readonly quality: Quality | null;
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
  'maidan-end': ['maidan-end'],
};

/** Deterministic variant pick for the tile at column `col`, world row `row` (no RNG: same scene, same tiles). */
export function tileFrame(tile: GroundTile, col: number, row: number): string {
  const variants = TILE_VARIANTS[tile];
  let n = Math.imul(col + 1, 374761393) ^ Math.imul(row + 1, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  const pick = variants[((n ^ (n >>> 16)) >>> 0) % variants.length] ?? tile;
  return `ground.${pick}/idle/00`;
}

export function createGroundLayer({ layout, frame, lessMotion, weather, quality }: GroundLayerOptions): WorldLayer {
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

    const frameList = (stem: string, anim: string, count: number): Texture[] =>
      Array.from({ length: count }, (_, i) => frame(`${stem}/${anim}/${String(i).padStart(2, '0')}`));
    const placed = layout.props.map((p) => {
      const names = propFrames(p.sprite);
      // Animated props cycle (windmill sails) or sway (trees) over `<sprite>/idle/NN` frames; others show frame 00.
      const count = p.animate ? (p.animate.kind === 'cycle' ? p.animate.frames : SWAY.frames) : 0;
      const anim = frameList(p.sprite, 'idle', count);
      const sprite = new Sprite({ texture: frame(names.base), roundPixels: true });
      // Atlas anchors put the pivot at the bottom-centre of the ground row (or the hub, for lifted props).
      sprite.anchor.copyFrom(sprite.texture.defaultAnchor ?? { x: 0.5, y: 1 });
      let shadow: Sprite | null = null;
      if (p.shadow !== false) {
        shadow = new Sprite({ texture: frame(names.shadow), roundPixels: true });
        shadow.anchor.copyFrom(shadow.texture.defaultAnchor ?? { x: 0.5, y: 1 });
        shadows.addChild(shadow);
      }
      props.addChild(sprite);
      return { prop: p, sprite, shadow, anim };
    });

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
    let shadowsOn: boolean = QUALITY_TIERS[quality ?? 'med'].cloudShadows;

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
        // A lifted prop (sails on a hub) hangs `lift` px above its ground row but sorts just in front of it.
        sprite.position.set(prop.x, y - (prop.lift ?? 0));
        shadow?.position.set(prop.x, y);
        sprite.zIndex = y + (prop.lift ? 0.5 : 0);
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
      setQuality: (q) => {
        shadowsOn = QUALITY_TIERS[q].cloudShadows;
      },
      update: ({ seconds, ambient, cycle, scene }) => {
        // Plots follow the game (M1-19): a building's props stand while its visual tier is in their range.
        for (const { decal, sprite } of placedDecals) sprite.visible = plotShown(decal.plot, scene.tiers);
        for (const { prop, sprite, shadow, anim } of placed) {
          const shown = plotShown(prop.plot, scene.tiers);
          sprite.visible = shown;
          if (shadow) shadow.visible = shown;
          if (!shown) continue;
          const a = prop.animate;
          if (!a || anim.length === 0) continue;
          const index =
            a.kind === 'sway'
              ? swayFrame(ambient, a, scene.wind, lessMotion)
              : Math.floor(ambient * (a.fps === 'wind' ? sailFps(scene.wind) : a.fps)) % anim.length;
          const texture = anim[index];
          if (texture) sprite.texture = texture;
        }
        const level = cloudShadowLevel(cycle);
        cloudShadows.visible = shadowsOn && level > 0.01 && weather === 'clear';
        cloudShadows.alpha = CLOUD_SHADOW.alpha * level;
        const scroll = (speed: number, w: number): number => Math.round((((ambient * speed) % w) + w) % w);
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
