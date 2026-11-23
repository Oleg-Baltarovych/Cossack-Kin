// Moonlight rim on the ground props (M2-29 A4, replaces pixi-filters `BevelFilter`): one filter pass on the sorted
// props before the grade, the same cost as the bevel it replaces. A px is lit when its neighbour toward the moon —
// one up and one toward the moon's side — is open air (as the bevel did with a √2 thickness). Down a thin vertical line
// (≤ 3 px wide: an outlined 1-px willow strand or stake) only the top px keeps the full rim; the px below it take
// `thin` of it, so the strands read as dark lines with a lit tip instead of glowing wires.
import { Filter, GlProgram, UniformGroup, defaultFilterVert } from 'pixi.js';

const FRAGMENT = `
precision highp float;
in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform vec4 uInputSize;
uniform vec3 uColor;
uniform float uAlpha;
uniform float uSide;
uniform float uThin;

float alphaAt(vec2 offset) {
  return texture(uTexture, vTextureCoord + offset * uInputSize.zw).a;
}

void main(void) {
  vec4 color = texture(uTexture, vTextureCoord);
  if (color.a <= 0.0) {
    finalColor = color;
    return;
  }
  // Open air toward the moon: one px up and one toward its side (uSide -1 = left, +1 = right).
  float open = 1.0 - alphaAt(vec2(uSide, -1.0));
  // A thin vertical line below its top px: opaque above, open air on the moon's side and again within 3 px on the
  // other (an outlined 1-px strand is 3 px wide: outline, leaf, outline). Walls and crowns are wider.
  float across = max(1.0 - alphaAt(vec2(-uSide, 0.0)), max(1.0 - alphaAt(vec2(-2.0 * uSide, 0.0)), 1.0 - alphaAt(vec2(-3.0 * uSide, 0.0))));
  float line = (1.0 - alphaAt(vec2(uSide, 0.0))) * across * alphaAt(vec2(0.0, -1.0));
  float rim = clamp(color.a * open * uAlpha, 0.0, 1.0) * mix(1.0, uThin, line);
  vec3 rgb = color.rgb / color.a;
  finalColor = vec4(mix(rgb, uColor, rim) * color.a, color.a);
}
`;

export interface MoonRimFilter {
  readonly filter: Filter;
  /** Toward which side of the sky the moon stands, and how strong the rim is (0..1 of the way to its colour). */
  set(side: 'left' | 'right', alpha: number): void;
  destroy(): void;
}

/** `color` as 0..1 rgb; `thin` = the share of the rim the px of a 1-px vertical line keep below its top. */
export function createMoonRim(color: readonly [number, number, number], thin: number): MoonRimFilter {
  const uniforms = new UniformGroup({
    uColor: { value: new Float32Array(color), type: 'vec3<f32>' },
    uAlpha: { value: 0, type: 'f32' },
    uSide: { value: -1, type: 'f32' },
    uThin: { value: thin, type: 'f32' },
  });
  const filter = new Filter({
    glProgram: GlProgram.from({ vertex: defaultFilterVert, fragment: FRAGMENT, name: 'moon-rim' }),
    resources: { moonRim: uniforms },
    // The bevel's workaround too: the rim needs one px of open air around the container's bounds.
    padding: 1,
    resolution: 1,
    antialias: 'off',
  });
  return {
    filter,
    set(side, alpha) {
      uniforms.uniforms.uSide = side === 'left' ? -1 : 1;
      uniforms.uniforms.uAlpha = alpha;
    },
    destroy() {
      filter.destroy();
    },
  };
}
