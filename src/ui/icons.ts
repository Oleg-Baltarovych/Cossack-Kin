// The UI icon atlas (plan M2-14): `pnpm sprites` packs the 16×16 icons (assets-src/gen/ui/icon) into
// public/atlases/ui.png|json; the DOM draws them as a CSS sprite (`components/Icon.tsx`), scaled by whole `--px` with
// `image-rendering: pixelated`. The JSON is fetched once, on the first icon mounted (same origin: CSP `connect-src
// 'self'`, `img-src 'self'`). Until it arrives — or if it never does — an icon is an empty box of its size: every icon
// stands next to its text (SPEC §6.8), so nothing is lost but the picture.
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
export type IconId = (typeof ICON_IDS)[number];

export interface IconFrame {
  readonly x: number;
  readonly y: number;
}

export interface IconAtlas {
  readonly url: string;
  readonly w: number;
  readonly h: number;
  /** Only ids of `ICON_IDS` whose frame is whole and inside the sheet; a missing one draws its text fallback. */
  readonly frames: ReadonlyMap<IconId, IconFrame>;
}

/** What an icon can draw now: the atlas, nothing yet (`loading`), or never (`failed`: show the text fallback). */
export type IconSource = IconAtlas | 'loading' | 'failed';

const FRAME = /^icon\.([a-z][a-z0-9-]*)\/idle\/00$/;
const ICON_PX = 16;

const isIconId = (v: string): v is IconId => (ICON_IDS as readonly string[]).includes(v);

/**
 * The atlas JSON (untrusted input) → icon frames by id. Throws when the sheet itself is malformed; a malformed or
 * unknown frame is skipped, and the ids left without a frame are listed in `missing`.
 */
export function parseIconAtlas(json: unknown, dir = ATLAS_DIR): IconAtlas & { readonly missing: readonly IconId[] } {
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
    const id = FRAME.exec(name)?.[1];
    if (id === undefined || !isIconId(id)) continue;
    const f = isRecord(entry) ? entry['frame'] : undefined;
    if (!isRecord(f)) continue;
    const { x, y, w: fw, h: fh } = f;
    if (!isCount(x) || !isCount(y) || fw !== ICON_PX || fh !== ICON_PX || x + ICON_PX > w || y + ICON_PX > h) continue;
    frames.set(id, { x, y });
  }
  return { url: `${dir}${image}`, w, h, frames, missing: ICON_IDS.filter((id) => !frames.has(id)) };
}

const ui = atlasSource(
  'ui.json',
  (json, dir) => {
    const a = parseIconAtlas(json, dir);
    // A gap means a stale or broken build: say so, and those icons fall back to their text.
    if (a.missing.length > 0) console.warn('icons: no frame for %s', a.missing.join(', '));
    return a;
  },
  'icons: the UI atlas did not load: %o',
);

/** The atlas, `loading` until it arrives, or `failed`; the first call starts the load. */
export function useIconAtlas(): IconSource {
  return ui.use();
}
