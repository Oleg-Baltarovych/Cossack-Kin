// Layer 4 — ground (parallax 1.0, ART-05). Tiled ground rows from the scene layout (content/villages/
// khortytsia.layout.ts, `ground.<tile>` 64×32 frames of the `khortytsia` atlas; grass picks one of its seeded
// variants per tile), then flat decals (yards), then the props' `@shadow` frames, then the props themselves Y-sorted by
// their pivot (SPEC §6.2). All sprites come from one atlas texture, so the
// whole layer is one batch. Night window masks are not here: they live in the post-grade emissive container.
import { Container, Sprite, type Texture } from 'pixi.js';
import type { GroundTile, SceneLayout } from '../../content/villages/khortytsia.layout.ts';
import { contentWidth, createLayer, horizonY, type WorldLayer } from './Layer.ts';

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
  earth: ['earth'],
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
    container.addChild(tiles, decals, shadows, props);

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

    return (size) => {
      for (const child of tiles.removeChildren()) child.destroy();
      const width = contentWidth(PARALLAX, size);
      const horizon = horizonY(size.viewH);
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
      for (const { decal, sprite } of placedDecals) sprite.position.set(decal.x, horizon + decal.ground);
      for (const { prop, sprite, shadow } of placed) {
        const y = horizon + prop.ground;
        sprite.position.set(prop.x, y);
        shadow.position.set(prop.x, y);
        sprite.zIndex = y;
      }
    };
  });
}
