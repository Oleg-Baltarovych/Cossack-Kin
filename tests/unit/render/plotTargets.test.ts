import { Rectangle, Texture, TextureSource } from 'pixi.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Prop } from '../../../src/content/villages/khortytsia.layout.ts';
import { atlasMask, propTargets, type FrameMask } from '../../../src/render/plotTargets.ts';

function texture(w: number, h: number, defaultAnchor?: { x: number; y: number }): Texture {
  const source = new TextureSource({ width: 64, height: 64 });
  const frame = new Rectangle(0, 0, w, h);
  return new Texture(defaultAnchor ? { source, frame, defaultAnchor } : { source, frame });
}

const HORIZON = 100;

afterEach(() => {
  vi.restoreAllMocks();
});

describe('propTargets (M2-13: where each drawn prop is, for the tap hit-test)', () => {
  it('places the frame by its atlas anchor at the pivot (x, horizon + ground − lift) in whole px, z = ground row', () => {
    const hut = texture(20, 30, { x: 0.5, y: 0.9 });
    const sails = texture(11, 11, { x: 0.5, y: 0.5 });
    const props: Prop[] = [
      { sprite: 'khata.t1', x: 50, ground: 40, plot: { building: 'potter', from: 1 } },
      { sprite: 'windmill-sails', x: 80, ground: 40, lift: 20 },
    ];
    const frames = new Map<string, Texture>([
      ['khata.t1', hut],
      ['windmill-sails', sails],
    ]);
    const [a, b] = propTargets(
      { props },
      HORIZON,
      (p) => frames.get(p.sprite) ?? hut,
      () => () => true,
    );
    expect(a).toMatchObject({ left: 40, top: 113, width: 20, height: 30, z: 140, plot: props[0]?.plot });
    // A lifted prop hangs `lift` rows up and sorts just in front of its ground row; no plot = an occluder.
    expect(b).toMatchObject({ left: 75, top: 115, width: 11, height: 11, z: 140.5, plot: undefined });
  });

  it('asks the frame mask only on a tap, once per texture across rebuilds (a resize does not re-read alpha)', () => {
    const tex = texture(4, 4, { x: 0.5, y: 1 });
    const read = vi.fn<(t: Texture) => FrameMask>(() => (lx) => lx >= 2);
    const cached = new Map<Texture, FrameMask>();
    const mask = (t: Texture): FrameMask => {
      const m = cached.get(t) ?? read(t);
      cached.set(t, m);
      return m;
    };
    const props: Prop[] = [{ sprite: 'tyn', x: 10, ground: 0 }];
    const first = propTargets({ props }, HORIZON, () => tex, mask);
    expect(read).not.toHaveBeenCalled();
    expect(first[0]?.opaque(1, 1)).toBe(false);
    expect(first[0]?.opaque(3, 1)).toBe(true);
    const second = propTargets({ props }, HORIZON + 7, () => tex, mask);
    expect(second[0]?.top).toBe((first[0]?.top ?? 0) + 7);
    second[0]?.opaque(3, 1);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('a frame without readable pixels counts as solid (its whole box) and says so in dev builds; read once', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const tex = texture(6, 6);
    const mask = atlasMask(tex);
    expect(mask(0, 0)).toBe(true);
    expect(mask(5, 5)).toBe(true);
    expect(atlasMask(tex)).toBe(mask);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
