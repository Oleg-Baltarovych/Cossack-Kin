// Raids in words (plans M3-09/11/12), shared by the «Походи» block, the map, the chest and the return window: a
// region's and a relic's name, «Дозор — Самара», and what a claim brought — through i18n keys and the player's number
// format, never glued by hand.
import { REGIONS, type RaidTierId, type RegionId } from '../content/raids.ts';
import { RELIC_DEFS, type RelicId } from '../content/relics.ts';
import type { RaidGranted } from '../core/events.ts';
import { raidTier } from '../core/systems/raids.ts';
import type { Text } from './hooks/useText.ts';
import { grantedText } from './rewards.ts';

const REGION_KEY: ReadonlyMap<RegionId, string> = new Map(
  Object.values(REGIONS).flatMap((list) => list.map((r) => [r.id, r.nameKey] as const)),
);
const RELIC_KEY: ReadonlyMap<RelicId, string> = new Map(RELIC_DEFS.map((r) => [r.id, r.nameKey]));

export const regionName = (text: Text, id: RegionId): string => text.t(REGION_KEY.get(id) ?? id);
export const relicName = (text: Text, id: RelicId): string => text.t(RELIC_KEY.get(id) ?? id);
export const tierName = (text: Text, tier: RaidTierId): string => text.t(raidTier(tier).nameKey);

/** «Дозор — Самара». */
export const raidWhere = (text: Text, tier: RaidTierId, region: RegionId): string =>
  text.t('ui.raids.where', { tier: tierName(text, tier), region: regionName(text, region) });

/** What a claim brought, in words: «+500 дук., +50 слави, реліквія «Пернач»» (only what is there). */
export function lootText(text: Text, granted: RaidGranted, relic: RelicId | null): string {
  const { ducats, glory, pysanky } = granted;
  return [
    ...(ducats.gt(0) ? [grantedText(text, { currency: 'ducats', amount: ducats })] : []),
    ...(glory.gt(0) ? [grantedText(text, { currency: 'glory', amount: glory })] : []),
    ...(pysanky > 0 ? [grantedText(text, { currency: 'pysanky', amount: pysanky })] : []),
    ...(relic !== null ? [text.t('ui.raids.saidRelic', { name: relicName(text, relic) })] : []),
  ].join(text.t('ui.raids.listSep'));
}
