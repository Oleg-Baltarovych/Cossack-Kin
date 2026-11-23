// Build fx wiring (M2-29 D code review): «менше руху» is read on every frame, not captured once, so a runtime toggle
// stops the ordinary upgrade's squash just as it stops the coins; a scaffold waits for its first builder up to its cap.
import { Rectangle, Texture, TextureSource } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { UPGRADE_JUICE } from '../../../src/content/juice.ts';
import type { WorldLayout } from '../../../src/content/villages/khortytsia.layout.ts';
import { BUILD } from '../../../src/render/atmosphere/config.ts';
import { createBuildFx } from '../../../src/render/fx/build.ts';
import type { SceneState } from '../../../src/render/scene.ts';

const source = new TextureSource({ width: 64, height: 64 });
const texture = new Texture({ source, frame: new Rectangle(0, 0, 40, 30), defaultAnchor: { x: 0.5, y: 1 } });

// Only what createBuildFx reads: one building's tier-I look.
const layout = {
  tierSprites: [{ building: 'field', x: 100, ground: 50, tiers: [{ parts: [{ sprite: 'field' }] }] }],
} as unknown as WorldLayout; // a test fixture: the build fx reads `tierSprites` only

const scene = { tiers: { field: 1 }, wind: 0 } as unknown as SceneState; // a test fixture: present() reads tiers/marks

const PEAK = UPGRADE_JUICE.squashDelayMs + UPGRADE_JUICE.squashMs / 2;

describe('createBuildFx (M2-29 D)', () => {
  it('the squash follows «менше руху» as it is now: switched on mid-squash, the building stops at once', () => {
    let still = false;
    const fx = createBuildFx(
      layout,
      () => texture,
      () => still,
      () => 0,
    );
    fx.bump('field', 0);
    expect(fx.present(scene, PEAK, 0).pop?.field).toBeCloseTo(UPGRADE_JUICE.squashPeak, 5);
    fx.bump('field', 1000);
    still = true;
    expect(fx.present(scene, 1000 + PEAK, 0).pop).toBeUndefined();
    // And a purchase while it is on squashes nothing.
    fx.bump('field', 2000);
    expect(fx.present(scene, 2000 + PEAK, 0).pop).toBeUndefined();
    fx.destroy();
  });

  it('a scaffold holds its first stage while its builders come, up to the wait cap, then goes up', () => {
    const waitMs = 5000;
    let knocks = 0;
    const fx = createBuildFx(
      layout,
      () => texture,
      () => false,
      () => 0,
      () => {
        knocks += 1;
      },
      () => 'coming',
      waitMs,
    );
    fx.construct('field', 0);
    expect(fx.scaffolds().map((s) => s.building)).toEqual(['field']);
    // Long past the plain scaffold time, still at stage 0 (the building hidden), since nobody has come.
    expect(fx.present(scene, 3 * BUILD.stageMs * 3, 0).tiers?.field).toBe(0);
    expect(fx.present(scene, waitMs - 1, 0).tiers?.field).toBe(0);
    expect(knocks, 'no knock while nobody hammers').toBe(0);
    fx.present(scene, waitMs, 0);
    expect(knocks, 'the first stage knocks as the stages start').toBe(1);
    // From the cap on, the plain clock: the whole build is over well after it.
    expect(fx.present(scene, waitMs + 60_000, 0).tiers?.field).toBe(1);
    expect(fx.scaffolds()).toEqual([]);
    expect(knocks).toBe(3);
    fx.destroy();
  });
});
