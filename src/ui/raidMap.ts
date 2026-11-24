// The raid map's sprites (plan M3-10/M3-11): `pnpm sprites` packs the parchment map of the Lower Dnipro, the five tier
// flags, the rumour glint and the marching squad into public/atlases/map.png|json. The map is needed on one screen
// only, so the DOM fetches it when that screen first opens (ui/atlasSource.ts) — never at start, and never into Pixi
// (render/atlases.ts loads the world's atlases only). Every sprite is drawn as a CSS sprite at whole `--px`.
import { RAID_TIER_IDS, type RaidTierId } from '../content/raids.ts';
import { ATLAS_DIR, ATLAS_IMAGE, atlasSource, isCount, isRecord, type AtlasState } from './atlasSource.ts';

/** A frame of the sheet and its pivot (whole px from the frame's top-left). */
export interface MapSprite {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly px: number;
  readonly py: number;
}

export interface RaidMapAtlas {
  readonly url: string;
  /** The parchment map, pivot top-left (a map px = a frame px). */
  readonly map: MapSprite | null;
  readonly markers: ReadonlyMap<RaidTierId, MapSprite>;
  readonly rumor: MapSprite | null;
  /** The squad's march frames in order (empty when the sheet has none). */
  readonly squad: readonly MapSprite[];
}

export const MAP_FRAMES = {
  map: 'raid-map.khortytsia/idle/00',
  marker: (tier: RaidTierId) => `raid-marker.${tier}/idle/00`,
  rumor: 'raid-rumor/idle/00',
  squad: (i: number) => `raid-squad/march/${String(i).padStart(2, '0')}`,
} as const;
const SQUAD_FRAMES = 4;

const isUnit = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;

/** The atlas JSON (untrusted input) → the map's sprites; a malformed sheet throws, a bad or missing frame is left out. */
export function parseRaidMap(json: unknown, dir = ATLAS_DIR): RaidMapAtlas {
  if (!isRecord(json) || !isRecord(json['frames']) || !isRecord(json['meta'])) throw new Error('map atlas: bad json');
  const meta = json['meta'];
  const size = meta['size'];
  const image = meta['image'];
  if (
    typeof image !== 'string' ||
    !ATLAS_IMAGE.test(image) ||
    !isRecord(size) ||
    !isCount(size['w']) ||
    !isCount(size['h'])
  )
    throw new Error('map atlas: bad meta');
  const sheetW = size['w'];
  const sheetH = size['h'];
  const all = json['frames'];
  const sprite = (name: string): MapSprite | null => {
    const entry = all[name];
    if (!isRecord(entry) || !isRecord(entry['frame'])) return null;
    const { x, y, w, h } = entry['frame'];
    if (!isCount(x) || !isCount(y) || !isCount(w) || !isCount(h) || w === 0 || h === 0) return null;
    if (x + w > sheetW || y + h > sheetH) return null;
    const anchor = isRecord(entry['anchor']) ? entry['anchor'] : { x: 0, y: 0 };
    const ax = anchor['x'];
    const ay = anchor['y'];
    if (!isUnit(ax) || !isUnit(ay)) return null;
    return { x, y, w, h, px: Math.round(ax * w), py: Math.round(ay * h) };
  };
  const markers = new Map<RaidTierId, MapSprite>();
  for (const tier of RAID_TIER_IDS) {
    const s = sprite(MAP_FRAMES.marker(tier));
    if (s) markers.set(tier, s);
  }
  const squad: MapSprite[] = [];
  for (let i = 0; i < SQUAD_FRAMES; i++) {
    const s = sprite(MAP_FRAMES.squad(i));
    if (!s) break;
    squad.push(s);
  }
  return { url: `${dir}${image}`, map: sprite(MAP_FRAMES.map), markers, rumor: sprite(MAP_FRAMES.rumor), squad };
}

/**
 * Whether the march frames can run as one CSS animation (`steps()` over the background position): the same size and
 * pivot, side by side in one row at an even stride. Otherwise the squad stands on its first frame.
 */
export function squadStride(frames: readonly MapSprite[]): number | null {
  const [first, second] = frames;
  if (!first || !second || frames.length < 2) return null;
  const stride = second.x - first.x;
  if (stride < first.w) return null;
  return frames.every(
    (f, i) =>
      f.x === first.x + i * stride &&
      f.y === first.y &&
      f.w === first.w &&
      f.h === first.h &&
      f.px === first.px &&
      f.py === first.py,
  )
    ? stride
    : null;
}

const map = atlasSource('map.json', parseRaidMap, 'raid map: the map atlas did not load: %o');

/** The map atlas, `loading` until it arrives, or `failed`; the first call (the map screen opening) starts the load. */
export function useRaidMapAtlas(): AtlasState<RaidMapAtlas> {
  return map.use();
}
