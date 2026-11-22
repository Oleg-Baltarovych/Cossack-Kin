// Layer 4 — ground (parallax 1.0, ART-05). Tiled ground rows from the scene layout (content/villages/
// khortytsia.layout.ts, `ground.<tile>` 64×32 frames of the `khortytsia` atlas; grass picks one of its seeded
// variants per tile), then flat decals (yards), then the props' `@shadow` frames, then the props themselves Y-sorted by
// their pivot (SPEC §6.2), then the cloud shadows over everything (ART-07: one tiled overlay scrolling with the wind,
// opacity by time of day), with the agents on the path graph (render/agents/, M2-16) sorted among them and re-posed
// every frame. All sprites come from one atlas texture, so the whole layer is one batch. Night window masks are not here: they live in the post-grade emissive container.
import { Container, Rectangle, Sprite, Texture } from 'pixi.js';
import { BevelFilter } from 'pixi-filters';
import {
  GROUND_TILE,
  type BandPlot,
  type GroundTile,
  type WorldLayout,
} from '../../content/villages/khortytsia.layout.ts';
import { cullByX } from '../cull.ts';
import {
  CLOUD_SHADOW,
  DAYTIME_PROPS,
  MOON_RIM,
  MOON_RIM_LEVELS,
  QUALITY_TIERS,
  sailFps,
  SWAY,
} from '../atmosphere/config.ts';
import { outlineSets, type OutlineItem, type Outlines } from '../fx/outline.ts';
import { rampColor } from '../palette.ts';
import type { PlotBuilding } from '../../content/villages/khortytsia.layout.ts';
import { popSize } from '../fx/construction.ts';
import { plotShown } from '../scene.ts';
import type { VisualTiers } from '../../core/selectors.ts';
import { cloudShadowLevel, emissiveLevel, keyLevel } from '../atmosphere/emissive.ts';
import type { Quality, Weather } from '../settings.ts';
import { swayFrame } from '../sway.ts';
import { riverRowEnd } from '../zones.ts';
import { personAnim } from '../agents/sim.ts';
import type { AgentSprite, PersonAnim } from '../../content/agents.ts';
import { contentWidth, createLayer, horizonY, type LayerSize, type WorldLayer } from './Layer.ts';

const PARALLAX = 1;
const { w: TILE_W, h: TILE_H } = GROUND_TILE;
/** Culling margin (logical px) around the view: wide enough for any sprite's anchor/mirror slack. */
const CULL_MARGIN = 16;

/** Frame lookup in the scene atlas (`<name>` → texture; throws on a missing frame). */
export type FrameLookup = (name: string) => Texture;

export interface GroundLayerOptions {
  readonly layout: WorldLayout;
  readonly frame: FrameLookup;
  /** «Менше руху»: swaying props stand upright. */
  readonly lessMotion: boolean;
  /** Under rain or fog there is no direct sun, so no cloud shadows (ART-17). */
  readonly weather: Weather;
  /** Cloud shadows by tier (ART-18); `null` = auto, starts at med. */
  readonly quality: Quality | null;
  /** Where the scene's `marks` (selected / flashing buildings) are outlined, after the grade (M2-29). */
  readonly outlines?: Outlines | undefined;
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
  road: ['road'],
  trodden: ['trodden', 'trodden-b', 'trodden-c'],
  moat: ['moat'],
  rampart: ['rampart'],
  ditch: ['ditch'],
};

/** Deterministic variant pick for the tile at column `col`, world row `row` (no RNG: same scene, same tiles). */
export function tileFrame(tile: GroundTile, col: number, row: number): string {
  const variants = TILE_VARIANTS[tile];
  let n = Math.imul(col + 1, 374761393) ^ Math.imul(row + 1, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  const pick = variants[((n ^ (n >>> 16)) >>> 0) % variants.length] ?? tile;
  return `ground.${pick}/idle/00`;
}

/**
 * A plot band's tile for the game's tiers: `off` while its plot is empty, else the last upgrade the building's tier
 * reached (`tiers` null = render alone: every plot stands, at its top look), else `on`.
 */
export function plotTileTexture<T>(
  t: {
    readonly plot: BandPlot;
    readonly on: T;
    readonly off: T;
    readonly upgrades: readonly { from: number; texture: T }[];
  },
  tiers: VisualTiers | null,
): T {
  if (!plotShown(t.plot, tiers, null)) return t.off;
  const tier = tiers ? tiers[t.plot.building] : Number.POSITIVE_INFINITY;
  return t.upgrades.reduce((tex, u) => (tier >= u.from ? u.texture : tex), t.on);
}

export function createGroundLayer({
  layout,
  frame,
  lessMotion,
  weather,
  quality,
  outlines,
}: GroundLayerOptions): WorldLayer {
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
    // Moonlight on the props' upper edges (M2-29, MOON_RIM): a 1-px bevel toward the moon, before the grade; on only
    // at night under a clear sky (no filter pass by day).
    const moonRim = new BevelFilter({
      thickness: Math.SQRT2,
      lightColor: rampColor(...MOON_RIM.color),
      lightAlpha: 0,
      shadowAlpha: 0,
    });
    let moonOn = false;
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
    /** A building's own sprites (not its variant add-ons or day-only life): what an outline wraps. */
    const ownerOf = new Map<Sprite, PlotBuilding>();
    for (const { prop, sprite } of placed)
      if (prop.plot && prop.plot.variant === undefined && prop.daytime !== true)
        ownerOf.set(sprite, prop.plot.building);
    const box = (s: Sprite) => (): { x0: number; y0: number; x1: number; y1: number } => {
      const b = s.getBounds();
      return { x0: b.minX, y0: b.minY, x1: b.maxX, y1: b.maxY };
    };

    /** Agent sprites by agent id (M2-16): made on an agent's first pose, destroyed when it leaves the pool. */
    interface Person {
      stem: AgentSprite;
      /** Frames by animation, looked up on first use (walk/idle for everyone, the villager set, M2-17). */
      readonly anims: Map<PersonAnim, { readonly body: Texture[]; readonly shadow: Texture[] }>;
      readonly sprite: Sprite;
      readonly shadow: Sprite;
      seen: number;
    }
    const persons = new Map<number, Person>();
    let poseFrame = 0;
    const person = (id: number, stem: AgentSprite): Person => {
      const known = persons.get(id);
      if (known?.stem === stem) return known;
      if (known) {
        // Same agent, another look (a cart unloaded: `viz.full` → `viz.empty`): keep the sprites, swap the frames.
        const [entity = stem, variant = ''] = stem.split('.');
        known.stem = stem;
        known.anims.clear();
        known.sprite.texture = frame(`${stem}/idle/00`);
        known.shadow.texture = frame(`${entity}.${variant}@shadow/idle/00`);
        return known;
      }
      const [entity = stem, variant = ''] = stem.split('.');
      const sprite = new Sprite({ texture: frame(`${stem}/idle/00`), roundPixels: true });
      const shadow = new Sprite({ texture: frame(`${entity}.${variant}@shadow/idle/00`), roundPixels: true });
      sprite.anchor.copyFrom(sprite.texture.defaultAnchor ?? { x: 0.5, y: 1 });
      shadow.anchor.copyFrom(shadow.texture.defaultAnchor ?? { x: 0.5, y: 1 });
      shadows.addChild(shadow);
      props.addChild(sprite);
      const made: Person = { stem, anims: new Map(), sprite, shadow, seen: poseFrame };
      persons.set(id, made);
      return made;
    };
    /** A person's frames of `anim`: walk and idle share the standing contact shadow; a work pose has its own (props). */
    const personFrames = (p: Person, anim: PersonAnim): { body: Texture[]; shadow: Texture[] } => {
      const known = p.anims.get(anim);
      if (known) return known;
      const [entity = p.stem, variant = ''] = p.stem.split('.');
      const { frames } = personAnim(anim);
      const own = anim !== 'walk' && anim !== 'idle';
      const made = {
        body: frameList(p.stem, anim, frames),
        shadow: own
          ? frameList(`${entity}.${variant}@shadow`, anim, frames)
          : [frame(`${entity}.${variant}@shadow/idle/00`)],
      };
      p.anims.set(anim, made);
      return made;
    };
    function drop(id: number, p: Person): void {
      persons.delete(id);
      p.sprite.destroy();
      p.shadow.destroy();
    }
    /** Tiles of plot bands (the maidan, the rampart): `on` while the plot stands, `off` while it is empty. */
    const plotTiles: {
      sprite: Sprite;
      plot: BandPlot;
      on: Texture;
      off: Texture;
      upgrades: { from: number; texture: Texture }[];
    }[] = [];
    /** The last, cut shore tile where the river's nearest row ends (owned: destroyed on resize and dispose). */
    let shoreEnd: Texture | null = null;
    let viewW = 0;
    let horizon = 0;
    let shadowsOn: boolean = QUALITY_TIERS[quality ?? 'med'].cloudShadows;

    const resize = (size: LayerSize): void => {
      for (const child of tiles.removeChildren()) child.destroy();
      shoreEnd?.destroy(false);
      shoreEnd = null;
      const width = contentWidth(PARALLAX, size);
      horizon = horizonY(size.viewH);
      viewW = size.viewW;
      plotTiles.length = 0;
      // Each zone's ground from its left edge (M2-01): tile columns and their seeded variants count from the zone's
      // edge, so every zone keeps the tiles of its M-ART scene; the last zone's tiles may run past the world's end.
      for (const segment of layout.segments) {
        const bands = [...segment.rows];
        const last = bands[bands.length - 1];
        const fillTop = last ? last.top + last.h : 0;
        bands.push({ tile: segment.fill, top: fillTop, h: Math.max(0, size.viewH - horizon - fillTop) });
        for (const band of bands) {
          for (let y = 0; y < band.h; y += TILE_H) {
            for (let x = 0; x < segment.x1 - segment.x0 && segment.x0 + x < width; x += TILE_W) {
              const at = (tile: GroundTile): Texture => frame(tileFrame(tile, x / TILE_W, (band.top + y) / TILE_H));
              const texture = at(band.tile);
              const tile = new Sprite({ texture, roundPixels: true });
              tile.position.set(segment.x0 + x, horizon + band.top + y);
              tiles.addChild(tile);
              // A plot band swaps its tiles while the plot is empty (M1-19 art review).
              if (band.plot)
                plotTiles.push({
                  sprite: tile,
                  plot: band.plot,
                  on: texture,
                  off: at(band.alt ?? segment.fill),
                  upgrades: (band.upgrades ?? []).map((u) => ({ from: u.from, texture: at(u.tile) })),
                });
            }
          }
        }
      }
      // The near bank's edge under the river (ART-09): shore tiles right under the last water row, as far as that
      // row runs (the taper beyond it has no straight bank line).
      const river = layout.river;
      if (river && river.rows > 0) {
        const shore = frame('shore/idle/00');
        const x1 = Math.min(width, riverRowEnd(river, river.rows - 1));
        for (let x = river.x0; x < x1; x += shore.width) {
          const w = Math.min(shore.width, x1 - x);
          let texture = shore;
          if (w < shore.width) {
            const f = shore.frame;
            shoreEnd = new Texture({ source: shore.source, frame: new Rectangle(f.x, f.y, w, f.height) });
            texture = shoreEnd;
          }
          const tile = new Sprite({ texture, roundPixels: true });
          tile.position.set(x, horizon + river.rows);
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
      dispose: () => {
        shoreEnd?.destroy(false);
        shoreEnd = null;
        props.filters = [];
        moonRim.destroy();
      },
      setQuality: (q) => {
        shadowsOn = QUALITY_TIERS[q].cloudShadows;
      },
      update: ({ agents, ambient, cycle, scene, camX }) => {
        // Plots follow the game (M1-19): a building's props stand while its visual tier is in their range.
        for (const { decal, sprite } of placedDecals)
          sprite.visible = plotShown(decal.plot, scene.tiers, scene.variants);
        for (const t of plotTiles) t.sprite.texture = plotTileTexture(t, scene.tiers);
        // Day-only life (bees) is out by day and never under «менше руху».
        const daylight = !lessMotion && emissiveLevel(cycle) < DAYTIME_PROPS.maxEmissive;
        for (const { prop, sprite, shadow, anim } of placed) {
          const shown = plotShown(prop.plot, scene.tiers, scene.variants) && (prop.daytime !== true || daylight);
          sprite.visible = shown;
          if (shadow) shadow.visible = shown;
          if (!shown) continue;
          // A building popping in (M2-12, Q5): scaled about its pivot to a whole-px size (rows/columns repeat under
          // nearest sampling); a lifted part (sails) rides up with the grown building.
          const k = prop.plot ? (scene.pop?.[prop.plot.building] ?? 1) : 1;
          if (k !== 1 || sprite.scale.y !== 1) {
            const size = popSize(sprite.texture.width, sprite.texture.height, k);
            sprite.scale.set(size.w / sprite.texture.width, size.h / sprite.texture.height);
            sprite.y = horizon + prop.ground - Math.round((prop.lift ?? 0) * k);
          }
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
        poseFrame += 1;
        for (const pose of agents) {
          const p = person(pose.id, pose.sprite);
          p.seen = poseFrame;
          const { sprite, shadow } = p;
          const frames = personFrames(p, pose.anim);
          const texture = frames.body[pose.frame];
          if (texture) sprite.texture = texture;
          const ground = frames.shadow[frames.shadow.length > 1 ? pose.frame : 0];
          if (ground) shadow.texture = ground;
          const y = horizon + pose.ground;
          sprite.position.set(pose.x, y);
          shadow.position.set(pose.x, y);
          // Mirrored about the pivot column; the anchor keeps the feet on the same px.
          sprite.scale.x = pose.facing;
          sprite.zIndex = y;
        }
        for (const [id, p] of persons) if (p.seen !== poseFrame) drop(id, p);
        // The world is ~5 screens wide (M2-01): only what overlaps the view (+ margin) is drawn.
        const x0 = camX - CULL_MARGIN;
        const x1 = camX + viewW + CULL_MARGIN;
        for (const into of [tiles, decals, shadows, props, nearShadows, farShadows]) cullByX(into, x0, x1);
        // Moonlight: toward the moon's side of the sky (its x on the sky's 0..1), strength by the key.
        const moon = weather === 'clear' && cycle.moon.y > 0 ? keyLevel(MOON_RIM_LEVELS, cycle) : 0;
        if (moon > 0.01) {
          moonRim.rotation = cycle.moon.x < 0.5 ? 45 : 135;
          moonRim.lightAlpha = MOON_RIM.alpha * Math.min(1, moon);
        }
        if (moon > 0.01 !== moonOn) {
          moonOn = moon > 0.01;
          props.filters = moonOn ? [moonRim] : [];
        }
        // Outlines of the marked buildings (selected row, a night tier flash), cut by whatever stands in front.
        if (outlines) {
          const marks = scene.marks ?? [];
          if (marks.length > 0) {
            const items: OutlineItem<Sprite>[] = [];
            for (const child of props.children) {
              if (!(child instanceof Sprite)) continue;
              items.push({
                item: child,
                building: ownerOf.get(child) ?? null,
                visible: child.visible,
                z: child.zIndex,
                box: box(child),
              });
            }
            marks.forEach((m, i) => {
              const { parts, occluders } = outlineSets(items, m.building);
              outlines.draw(i, parts, occluders, m);
            });
          }
          outlines.hideFrom(marks.length);
        }
      },
    };
  });
}
