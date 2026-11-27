// Story beat portraits (plan M2-25, Q14): no new art — a character sprite the world already draws, ×2 in a frame
// (48×48 portraits are M9). The DOM reads it from the generated `people` atlas as a CSS sprite, like the UI icons.
import { PORTRAIT_MAX_PX, type PortraitId } from '../content/story.ts';
import { ATLAS_DIR, ATLAS_IMAGE, atlasSource, isCount, isRecord, type AtlasState } from './atlasSource.ts';

/** The sprite frame each portrait shows (the messenger is a Cossack in his coat, `kozak.b`, Q14). */
export const PORTRAIT_FRAMES: Readonly<Record<PortraitId, string>> = {
  kharakternyk: 'kharakternyk.a/idle/00',
  kobzar: 'kobzar.a/idle/00',
  messenger: 'kozak.b/idle/00',
  otaman: 'otaman.a/idle/00',
};

export interface PortraitFrame {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface PortraitAtlas {
  readonly url: string;
  readonly frames: ReadonlyMap<PortraitId, PortraitFrame>;
}

/** The atlas JSON (untrusted) → the portrait frames; a malformed sheet throws, a bad frame is left out. */
export function parsePortraits(json: unknown, dir = ATLAS_DIR): PortraitAtlas {
  if (!isRecord(json) || !isRecord(json['frames']) || !isRecord(json['meta']))
    throw new Error('people atlas: bad json');
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
    throw new Error('people atlas: bad meta');
  const sheetW = size['w'];
  const sheetH = size['h'];
  const frames = new Map<PortraitId, PortraitFrame>();
  const all = json['frames'];
  for (const [id, name] of Object.entries(PORTRAIT_FRAMES) as [PortraitId, string][]) {
    const entry = all[name];
    const f = isRecord(entry) ? entry['frame'] : undefined;
    if (!isRecord(f)) continue;
    const { x, y, w, h } = f;
    if (!isCount(x) || !isCount(y) || !isCount(w) || !isCount(h) || w === 0 || h === 0) continue;
    // A frame bigger than the box is a broken build, not a portrait.
    if (w > PORTRAIT_MAX_PX.w || h > PORTRAIT_MAX_PX.h || x + w > sheetW || y + h > sheetH) continue;
    frames.set(id, { x, y, w, h });
  }
  return { url: `${dir}${image}`, frames };
}

const people = atlasSource('people.json', parsePortraits, 'portraits: the people atlas did not load: %o');

export function usePortraits(): AtlasState<PortraitAtlas> {
  return people.use();
}
