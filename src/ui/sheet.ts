// The bottom sheet's state machine (plan M2-13, SPEC §6.1): collapsed (only the tab bar, the world full screen) /
// half / full. Pure — the Panel measures heights and feeds drags, keys and taps on buildings through here.
import { SHEET } from '../content/juice.ts';
import { FARM_BUILDING_IDS, type FarmBuildingId } from '../content/villages/khortytsia.ts';
import type { PlotBuilding } from '../content/villages/khortytsia.layout.ts';

export const SHEET_STATES = ['collapsed', 'half', 'full'] as const;
export type SheetState = (typeof SHEET_STATES)[number];

/** The sheet's height in each state (css px). */
export type SheetHeights = Readonly<Record<SheetState, number>>;

export type SheetAction =
  /** The bar's button: collapsed → half → full → collapsed. */
  | { readonly type: 'toggle' }
  /** Esc: collapse. */
  | { readonly type: 'escape' }
  /** A tab chosen while collapsed, a building tapped in the world: at least half. */
  | { readonly type: 'open' }
  /** A quest tap that leads to a row (M3-15, SPEC §10.3): exactly half — the row over the camera's building. */
  | { readonly type: 'half' }
  /** A drag on the bar let go at `height` px moving `velocity` px/ms (> 0 = down, closing). */
  | {
      readonly type: 'release';
      readonly height: number;
      readonly velocity: number;
      readonly heights: SheetHeights;
    };

interface SnapConfig {
  readonly flickPxPerMs: number;
}

/**
 * Where a released drag settles: a flick (|velocity| ≥ `flickPxPerMs`) goes to the next state in its direction (the
 * end state when there is none); a slower release snaps to the nearest height.
 */
export function snapSheet(
  height: number,
  velocity: number,
  heights: SheetHeights,
  cfg: SnapConfig = SHEET,
): SheetState {
  const byHeight = [...SHEET_STATES].sort((a, b) => heights[a] - heights[b]);
  if (Math.abs(velocity) >= cfg.flickPxPerMs) {
    if (velocity > 0) return [...byHeight].reverse().find((s) => heights[s] < height) ?? byHeight[0] ?? 'collapsed';
    return byHeight.find((s) => heights[s] > height) ?? byHeight[byHeight.length - 1] ?? 'full';
  }
  let best: SheetState = 'half';
  for (const s of byHeight) if (Math.abs(heights[s] - height) < Math.abs(heights[best] - height)) best = s;
  return best;
}

export function sheetReducer(state: SheetState, action: SheetAction, cfg: SnapConfig = SHEET): SheetState {
  switch (action.type) {
    case 'toggle':
      return state === 'collapsed' ? 'half' : state === 'half' ? 'full' : 'collapsed';
    case 'escape':
      return 'collapsed';
    case 'open':
      return state === 'collapsed' ? 'half' : state;
    case 'half':
      return 'half';
    case 'release':
      return snapSheet(action.height, action.velocity, action.heights, cfg);
  }
}

const FARM_IDS: readonly string[] = FARM_BUILDING_IDS;
const isFarm = (id: PlotBuilding): id is FarmBuildingId => FARM_IDS.includes(id);

/** The list (tab) that holds a building's row: farm and suburb buildings → «Хутір», the Sich's → «Січ». */
export function tabOfBuilding(id: PlotBuilding): 'farm' | 'sich' {
  return isFarm(id) ? 'farm' : 'sich';
}
