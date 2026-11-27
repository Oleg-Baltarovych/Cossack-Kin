// The UI icon atlases (plan M2-14; M3-12 `loot`; M4-10 `culture`): `pnpm sprites` packs the 16×16 icons
// (assets-src/gen/ui/icon, assets-src/gen/loot/icon, assets-src/gen/culture/icon) into public/atlases/<atlas>.png|json;
// the DOM draws them as a CSS sprite (`components/Icon.tsx`), scaled by whole `--px` with `image-rendering: pixelated`.
// The JSON is fetched once, on the first icon mounted (same origin: CSP `connect-src 'self'`, `img-src 'self'`). Until
// it arrives — or if it never does — an icon is an empty box of its size: every icon stands next to its text
// (SPEC §6.8), so nothing is lost but the picture.
import type { CultureBranchId, CultureNodeId } from '../content/culture.ts';
import { ATLAS_DIR, ATLAS_IMAGE, atlasSource, isCount, isRecord } from './atlasSource.ts';

/** Icons of the atlas (the generator's `ICONS`; tests/unit/ui/icons.test.ts keeps the two lists equal). */
export const ICON_IDS = [
  'ducat',
  'glory',
  'kharch',
  'cossack',
  'defence',
  'wind-calm',
  'wind-breeze',
  'wind-storm',
  'pysanka',
  'lock',
  'quest',
  'milestone',
] as const;
/**
 * The `loot` atlas (plan M3-12; assets-src/gen/loot/icon): the raid's chest and the relics with their silhouettes. A
 * sheet of its own: growing `ui` changed how Chrome rasterised the HUD's top-row icons at dpr 3.5 (e2e hud.spec).
 */
export const LOOT_ICON_IDS = [
  'chest',
  'chest-open',
  'pernach',
  'porokhivnytsia',
  'pernach-unknown',
  'porokhivnytsia-unknown',
  'kobza',
  'kobza-unknown',
] as const;
/**
 * The `culture` atlas (plan M4-10; assets-src/gen/culture/icon): a node's icon is its id with `-` for `.` (frame-name
 * segments allow no dot), a branch's is its id. DOM-only, like `loot`: the `ui` sheet does not grow.
 */
export const CULTURE_ICON_IDS = [
  'music-dumy',
  'music-maidan',
  'music-campaign',
  'music-bandura',
  'music-lirnyky',
  'music-great',
  'customs-vechornytsi',
  'customs-toloka',
  'customs-hostyna',
  'customs-obzhynky',
  'customs-kupala',
  'customs-didukh',
  'music',
  'customs',
] as const;
export type UiIconId = (typeof ICON_IDS)[number];
export type LootIconId = (typeof LOOT_ICON_IDS)[number];
export type CultureIconId = (typeof CULTURE_ICON_IDS)[number];
export type IconId = UiIconId | LootIconId | CultureIconId;

/** The icon of a culture node or branch (exhaustive: a new node fails to compile until it has its icon). */
export const CULTURE_ICON: Readonly<Record<CultureNodeId | CultureBranchId, CultureIconId>> = {
  'music.dumy': 'music-dumy',
  'music.maidan': 'music-maidan',
  'music.campaign': 'music-campaign',
  'music.bandura': 'music-bandura',
  'music.lirnyky': 'music-lirnyky',
  'music.great': 'music-great',
  'customs.vechornytsi': 'customs-vechornytsi',
  'customs.toloka': 'customs-toloka',
  'customs.hostyna': 'customs-hostyna',
  'customs.obzhynky': 'customs-obzhynky',
  'customs.kupala': 'customs-kupala',
  'customs.didukh': 'customs-didukh',
  music: 'music',
  customs: 'customs',
};

export interface IconFrame {
  readonly x: number;
  readonly y: number;
}

export interface IconAtlas {
  readonly url: string;
  readonly w: number;
  readonly h: number;
  /** Only ids of the sheet's list whose frame is whole and inside the sheet; a missing one draws its text fallback. */
  readonly frames: ReadonlyMap<IconId, IconFrame>;
}

/** What an icon can draw now: the atlas, nothing yet (`loading`), or never (`failed`: show the text fallback). */
export type IconSource = IconAtlas | 'loading' | 'failed';

const FRAME_END = '/idle/00';
/** A frame name `<generator id>.<icon id>/idle/00` → the icon id (generator ids: `icon`, `loot-icon`, `culture-icon`). */
const frameId = (name: string, prefix: string): string | undefined =>
  name.startsWith(`${prefix}.`) && name.endsWith(FRAME_END)
    ? name.slice(prefix.length + 1, -FRAME_END.length)
    : undefined;
/** An icon frame: the 16×16 icon in a 1-px transparent margin (the generator's `ICON_FRAME`; M2-29 B1). */
const ICON_PX = 18;

/**
 * The atlas JSON (untrusted input) → icon frames by id. Throws when the sheet itself is malformed; a malformed or
 * unknown frame is skipped, and the ids left without a frame are listed in `missing`.
 */
export function parseIconAtlas(
  json: unknown,
  dir = ATLAS_DIR,
  ids: readonly IconId[] = ICON_IDS,
  prefix = 'icon',
): IconAtlas & { readonly missing: readonly IconId[] } {
  const isId = (v: string): v is IconId => (ids as readonly string[]).includes(v);
  if (!isRecord(json) || !isRecord(json['frames']) || !isRecord(json['meta'])) throw new Error('ui atlas: bad json');
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
    throw new Error('ui atlas: bad meta');
  const w = size['w'];
  const h = size['h'];
  const frames = new Map<IconId, IconFrame>();
  for (const [name, entry] of Object.entries(json['frames'])) {
    const id = frameId(name, prefix);
    if (id === undefined || !isId(id)) continue;
    const f = isRecord(entry) ? entry['frame'] : undefined;
    if (!isRecord(f)) continue;
    const { x, y, w: fw, h: fh } = f;
    if (!isCount(x) || !isCount(y) || fw !== ICON_PX || fh !== ICON_PX || x + ICON_PX > w || y + ICON_PX > h) continue;
    frames.set(id, { x, y });
  }
  return { url: `${dir}${image}`, w, h, frames, missing: ids.filter((id) => !frames.has(id)) };
}

/** A DOM icon sheet; a gap means a stale or broken build: say so, and those icons fall back to their text. */
const sheet = (file: string, name: string, ids: readonly IconId[], prefix: string) =>
  atlasSource(
    file,
    (json, dir) => {
      const a = parseIconAtlas(json, dir, ids, prefix);
      if (a.missing.length > 0) console.warn('icons: no frame for %s', a.missing.join(', '));
      return a;
    },
    `icons: the ${name} atlas did not load: %o`,
  );

const ui = sheet('ui.json', 'UI', ICON_IDS, 'icon');
const loot = sheet('loot.json', 'loot', LOOT_ICON_IDS, 'loot-icon');
const culture = sheet('culture.json', 'culture', CULTURE_ICON_IDS, 'culture-icon');
const isLoot = (id: IconId): id is LootIconId => (LOOT_ICON_IDS as readonly string[]).includes(id);
const isCulture = (id: IconId): id is CultureIconId => (CULTURE_ICON_IDS as readonly string[]).includes(id);

/** The sheet of `id`, `loading` until it arrives, or `failed`; the first call starts the load. */
export function useIconAtlas(id: IconId): IconSource {
  // Each sheet's `use` is the same hooks in the same order. An icon never changes sheets (chest → chest-open and
  // relic → silhouette stay in `loot`), so the load effect of the sheet it mounted with is the one it needs.
  return (isLoot(id) ? loot : isCulture(id) ? culture : ui).use();
}
