// Debug lineup (plan M2-17): every villager animation on both bodies in two rows, so the work set can be screenshotted
// in the scene before the FSM (M2-18) picks it.
import { describe, expect, it } from 'vitest';
import { lineupPoses, LINEUP, raidLineupPoses } from '../../../src/render/debug/lineup.ts';
import { VILLAGER_ANIMS, VILLAGER_SPRITES } from '../../../src/content/agents.ts';
import type { AgentPose } from '../../../src/render/agents/sim.ts';

const ANIMS = Object.keys(VILLAGER_ANIMS);

describe('lineupPoses', () => {
  it('shows every villager animation once per body, women in the back row, men in front', () => {
    const poses = lineupPoses(100, 160, 0);
    expect(poses).toHaveLength(ANIMS.length * 2);
    for (const body of ['selianka', 'selianyn']) {
      const row = poses.filter((p) => p.sprite.startsWith(`${body}.`));
      expect(row.map((p) => p.anim)).toEqual(ANIMS);
      expect(new Set(row.map((p) => p.ground)).size).toBe(1);
    }
    const women = poses.find((p) => p.sprite.startsWith('selianka.'));
    const men = poses.find((p) => p.sprite.startsWith('selianyn.'));
    expect(women?.ground).toBe(160);
    expect(men?.ground).toBe(160 + LINEUP.rowGap);
  });

  it('uses only villager sprites, cycles their outfits, keeps ids unique and x on whole px from x0', () => {
    const poses = lineupPoses(100, 160, 0);
    expect(poses.every((p) => (VILLAGER_SPRITES as readonly string[]).includes(p.sprite))).toBe(true);
    expect(new Set(poses.map((p) => p.sprite)).size).toBe(VILLAGER_SPRITES.length);
    expect(new Set(poses.map((p) => p.id)).size).toBe(poses.length);
    expect(poses.every((p) => Number.isInteger(p.x) && p.x >= 100)).toBe(true);
    expect(poses.every((p) => p.facing === 1)).toBe(true);
  });

  it('refuses a pool whose ids would reach the lineup ids', () => {
    expect(() => lineupPoses(0, 0, 0, LINEUP.firstId + 1)).toThrow(/lineup ids/);
    expect(lineupPoses(0, 0, 0, 25)).toHaveLength(ANIMS.length * 2);
  });

  it('plays each animation at its own rate and wraps', () => {
    const at = (s: number, anim: string): number =>
      lineupPoses(0, 0, s).find((p) => p.anim === anim && p.sprite.startsWith('selianyn.'))?.frame ?? -1;
    expect(at(0, 'work-field')).toBe(0);
    expect(at(1 / 8, 'work-field')).toBe(1);
    expect(at(6 / 8, 'work-field')).toBe(0);
    expect(at(0.5, 'sit')).toBe(1);
    expect(at(1, 'sit')).toBe(0);
    expect(at(0.3, 'cheer')).toBe(3);
  });

  it('the pose type lets only villager sprites carry the villager set (no frame that does not exist)', () => {
    const base = { id: 0, x: 0, ground: 0, facing: 1, frame: 0 } as const;
    const villager: AgentPose = { ...base, sprite: 'selianyn.c', anim: 'work-smithy' };
    const cossack: AgentPose = { ...base, sprite: 'kozak.a', anim: 'walk' };
    // @ts-expect-error a Cossack has no work frames (the type check is the assertion; tsc runs over tests)
    const illegal: AgentPose = { ...base, sprite: 'kozak.a', anim: 'work-field' };
    expect([villager.anim, cossack.anim, illegal.sprite]).toEqual(['work-smithy', 'walk', 'kozak.a']);
  });
});

describe('raidLineupPoses (M3-13)', () => {
  it('shows the three Cossacks, the otaman and the bearer marching, the bearer and the carriers at rest and marching', () => {
    const poses = raidLineupPoses(100, 160, 0);
    const shown = poses.map((p) => `${p.sprite}/${p.anim}`);
    for (const want of [
      'kozak.a/march',
      'kozak.b/march',
      'kozak.c/march',
      'otaman.a/march',
      'khorunzhyi.a/march',
      'khorunzhyi.a/idle',
      'nosii.a/idle',
      'nosii.a/march',
    ])
      expect(shown).toContain(want);
    expect(new Set(poses.map((p) => p.id)).size).toBe(poses.length);
    expect(poses.every((p) => p.id >= LINEUP.firstId && Number.isInteger(p.x) && p.x >= 100)).toBe(true);
    expect(new Set(poses.map((p) => p.ground))).toEqual(new Set([160, 160 + LINEUP.rowGap]));
  });

  it('the 44-px carriers get two steps, so no figure overlaps its neighbour', () => {
    const front = raidLineupPoses(0, 0, 0).filter((p) => p.ground === LINEUP.rowGap);
    const half = (p: { sprite: string }): number => (p.sprite === 'nosii.a' ? 22 : 9);
    for (let i = 1; i < front.length; i++) {
      const [a, b] = [front[i - 1], front[i]];
      if (!a || !b) throw new Error('row');
      expect(b.x - half(b)).toBeGreaterThanOrEqual(a.x + half(a));
    }
  });

  it('marches at 10 fps and wraps over 6 frames', () => {
    const at = (s: number): number => raidLineupPoses(0, 0, s).find((p) => p.sprite === 'kozak.a')?.frame ?? -1;
    expect(at(0)).toBe(0);
    expect(at(0.3)).toBe(3);
    expect(at(0.6)).toBe(0);
  });
});
