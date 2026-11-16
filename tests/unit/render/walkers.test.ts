import { describe, expect, it } from 'vitest';
import { IDLE_FPS, IDLE_FRAMES, WALK_FPS, WALK_FRAMES, walkerPose } from '../../../src/render/walkers.ts';
import type { Walker } from '../../../src/content/villages/khortytsia.layout.ts';

const route: Walker = { sprite: 'kozak.a', x0: 100, x1: 160, ground: 140, speed: 20, rest: 2, phase: 0 };

describe('walkerPose', () => {
  it('walks right from x0 at the route speed, facing right, cycling walk frames at WALK_FPS', () => {
    const p = walkerPose(route, 1);
    expect(p).toMatchObject({ x: 120, facing: 1, anim: 'walk' });
    expect(walkerPose(route, 0).frame).toBe(0);
    expect(walkerPose(route, 1 / WALK_FPS + 1e-6).frame).toBe(1);
    expect(walkerPose(route, WALK_FRAMES / WALK_FPS + 1e-6).frame).toBe(0);
  });

  it('rests at x1 in idle, then walks back facing left, rests at x0, and repeats', () => {
    const walk = (route.x1 - route.x0) / route.speed; // 3 s
    const rest = walkerPose(route, walk + 0.5);
    expect(rest).toMatchObject({ x: 160, anim: 'idle', facing: 1 });
    expect(rest.frame).toBe(Math.floor(0.5 * IDLE_FPS) % IDLE_FRAMES);
    expect(walkerPose(route, walk + route.rest + 1)).toMatchObject({ x: 140, facing: -1, anim: 'walk' });
    expect(walkerPose(route, 2 * walk + route.rest + 1)).toMatchObject({ x: 100, facing: -1, anim: 'idle' });
    const period = 2 * (walk + route.rest);
    expect(walkerPose(route, period + 1)).toEqual(walkerPose(route, 1));
  });

  it('stands idle when the route has no length, and keeps whole-px positions', () => {
    const still: Walker = { ...route, x1: route.x0 };
    expect(walkerPose(still, 7.3)).toMatchObject({ x: 100, anim: 'idle' });
    for (let t = 0; t < 10; t += 0.37) expect(Number.isInteger(walkerPose(route, t).x)).toBe(true);
  });

  it('phase offsets the schedule (two walkers on one route do not march in step)', () => {
    expect(walkerPose({ ...route, phase: 1 }, 0)).toEqual(walkerPose(route, 1));
  });
});
