// Debug lineup (`?lineup`, plan M2-17): every villager animation on both bodies, two rows facing right — the women
// (selianka) behind, the men (selianyn) in front — so the work set can be judged in the scene (light, grade, night)
// before the villager FSM (M2-18) picks it. Dev/test only: App replaces the agents' poses with these under
// `__CK_DEBUG__`, so production drops the module. Pure: poses = f(x0, ground, seconds).
import { VILLAGER_ANIMS, VILLAGER_SPRITES, type VillagerAnim } from '../../content/agents.ts';
import type { AgentPose } from '../agents/sim.ts';

export const LINEUP = {
  /** Ground row of the women's row (px below the horizon): open meadow under the farm road. */
  ground: 160,
  /** Distance between two figures (a 32-px frame each; props stand up to 15 px ahead of the pivot). */
  stepPx: 36,
  /** The men's row stands this far in front of the women's. */
  rowGap: 30,
  /** Ids above the agent pool's (pool ids are spawn indices). */
  firstId: 10_000,
} as const;

const ANIMS: readonly VillagerAnim[] = Object.entries(VILLAGER_ANIMS).map(([anim]) =>
  anim in VILLAGER_ANIMS ? (anim as VillagerAnim) : fail(anim),
);
/** Guards the narrowing above (Object.entries widens keys to string). */
function fail(anim: string): never {
  throw new Error(`lineup: unknown animation ${anim}`);
}
/** Below the frame count's float noise: `seconds * fps` of an exact frame boundary (e.g. 0.3 × 10) must not floor down. */
const EPSILON = 1e-9;

/** `poolSize` = the agent pool's size: lineup ids start above every pool id (pool ids are spawn indices). */
export function lineupPoses(x0: number, ground: number, seconds: number, poolSize = 0): AgentPose[] {
  if (poolSize > LINEUP.firstId) throw new Error(`lineup: ${String(poolSize)} agents reach the lineup ids`);
  const bodies = ['selianka', 'selianyn'] as const;
  return bodies.flatMap((body, row) => {
    const stems = VILLAGER_SPRITES.filter((s) => s.startsWith(`${body}.`));
    return ANIMS.map((anim, i): AgentPose => {
      const { frames, fps } = VILLAGER_ANIMS[anim];
      const sprite = stems[i % stems.length];
      if (!sprite) throw new Error(`lineup: no ${body} sprite`);
      return {
        id: LINEUP.firstId + row * ANIMS.length + i,
        sprite,
        x: Math.round(x0) + LINEUP.stepPx / 2 + i * LINEUP.stepPx,
        ground: ground + row * LINEUP.rowGap,
        facing: 1,
        anim,
        frame: Math.floor(seconds * fps + EPSILON) % frames,
      };
    });
  });
}
