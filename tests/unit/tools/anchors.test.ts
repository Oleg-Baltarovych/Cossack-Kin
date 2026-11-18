// Every sprite's pivot lands on a whole px (M2-07): with a half-px anchor (odd width, centre column) the sprite's
// edge falls between two device px and nearest-texel sampling picks a side by float error — which shifts with the
// atlas packing, so adding unrelated frames moved a hive by 1 px.
import { describe, expect, it } from 'vitest';
import { loadGenerators } from '../../../tools/lib/sprites/load.ts';

/** `coin` (fx, centred on its 9-px disc) predates the rule — a follow-up, outside the M2-07 scope. */
const EXEMPT = new Set(['coin']);

describe('sprite anchors', () => {
  it('put every pivot on a whole px', async () => {
    const off = (await loadGenerators())
      .filter((g) => !EXEMPT.has(g.id))
      .flatMap((g) => {
        const a = g.anchor ?? { x: 0.5, y: 1 };
        const ax = a.x * g.size.w;
        const ay = a.y * g.size.h;
        const whole = (v: number): boolean => Math.abs(v - Math.round(v)) < 1e-9;
        return whole(ax) && whole(ay) ? [] : [`${g.id} ${String(ax)},${String(ay)}`];
      });
    expect(off).toEqual([]);
  });
});
