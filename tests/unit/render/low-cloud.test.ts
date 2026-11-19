// Squashed low clouds (ART-07, M2-09): nearest sampling must never land on a texel edge, or the row it picks depends
// on UV rounding, i.e. on where the atlas packer put the cloud frame.
import { describe, expect, it } from 'vitest';
import { LOW_CLOUD } from '../../../src/render/atmosphere/config.ts';

describe('LOW_CLOUD.scaleY', () => {
  it('puts every screen row sample well inside a texel (no ties)', () => {
    for (let j = -64; j < 64; j++) {
      const texel = (j + 0.5) / LOW_CLOUD.scaleY;
      const fromEdge = Math.abs(texel - Math.round(texel));
      expect(fromEdge, `row ${String(j)}`).toBeGreaterThan(0.01);
    }
  });
});
