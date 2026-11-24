// Debug lineup (`?lineup`, plan M2-17): every villager animation on both bodies, two rows facing right — the women
// (selianka) behind, the men (selianyn) in front — so the work set can be judged in the scene (light, grade, night)
// before the villager FSM (M2-18) picks it. `?lineup=raid` (M3-13): the raid's figures — the three Cossacks, the
// otaman and the корогвоносець on the march behind, the bearer at rest and the chest carriers (at rest, marching) with
// the villagers' cheer in front — for the art review before M3-14 moves them. Dev/test only: App replaces the agents' poses with these under
// `__CK_DEBUG__`, so production drops the module. Pure: poses = f(x0, ground, seconds).
import {
  COSSACK_ANIMS,
  KOZAK_SPRITES,
  OTAMAN_ANIMS,
  RAID_ANIMS,
  VILLAGER_ANIMS,
  VILLAGER_SPRITES,
  type VillagerAnim,
} from '../../content/agents.ts';
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

/** The raid set's two rows (M3-13): every frame the squad leaves and comes home with. */
export function raidLineupPoses(x0: number, ground: number, seconds: number, poolSize = 0): AgentPose[] {
  if (poolSize > LINEUP.firstId) throw new Error(`lineup: ${String(poolSize)} agents reach the lineup ids`);
  const at = (fps: number, frames: number): number => Math.floor(seconds * fps + EPSILON) % frames;
  const march = RAID_ANIMS.march;
  const cheer = VILLAGER_ANIMS.cheer;
  const idle = { frames: 4, fps: 6 };
  // Placed below: id, x and ground are filled per row and slot.
  const base = { id: 0, x: 0, ground: 0, facing: 1 } as const;
  const back: AgentPose[] = [
    ...KOZAK_SPRITES.map((sprite): AgentPose => ({
      ...base,
      sprite,
      anim: 'march',
      frame: at(COSSACK_ANIMS.march.fps, COSSACK_ANIMS.march.frames),
    })),
    { ...base, sprite: 'otaman.a', anim: 'march', frame: at(OTAMAN_ANIMS.march.fps, OTAMAN_ANIMS.march.frames) },
    { ...base, sprite: 'khorunzhyi.a', anim: 'march', frame: at(march.fps, march.frames) },
    { ...base, sprite: 'khorunzhyi.a', anim: 'idle', frame: at(idle.fps, idle.frames) },
  ];
  const front: AgentPose[] = [
    { ...base, sprite: 'selianka.a', anim: 'cheer', frame: at(cheer.fps, cheer.frames) },
    { ...base, sprite: 'nosii.a', anim: 'idle', frame: at(idle.fps, idle.frames) },
    { ...base, sprite: 'nosii.a', anim: 'march', frame: at(march.fps, march.frames) },
    { ...base, sprite: 'selianyn.b', anim: 'cheer', frame: at(cheer.fps, cheer.frames) },
  ];
  return [back, front].flatMap((row, r) => {
    let slot = 0;
    return row.map((p, i): AgentPose => {
      // The carriers are a 44-px pair: they take two steps.
      const w = p.sprite === 'nosii.a' ? 2 : 1;
      const x = Math.round(x0) + Math.round((slot + w / 2) * LINEUP.stepPx);
      slot += w;
      return { ...p, id: LINEUP.firstId + r * 100 + i, x, ground: ground + r * LINEUP.rowGap };
    });
  });
}
