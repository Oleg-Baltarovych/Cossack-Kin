// Плуг — a wooden plough brought to the smith for a new share (plan M2-10, M2-29 B3: the smithy's third add-on in place
// of a second sheaf cart, which seed 1 showed twice in the suburb). The Ukrainian heavy plough: a small two-wheeled
// forecarriage (передок) at the left, the beam (гряділь) running back from its axle, the iron coulter (чересло) through
// the beam, the share (леміш) and a plank mouldboard (полиця) on the ground, two handles (чепіги) rising to the right.
// Iron is stone 5–6 lit / 2–3 shaded (fresh from the forge, the only bright px); wood is the cart's. Ramps: wood, stone,
// earth (a clod on the share). 40×20, pivot at the base centre; cast shadow.
import { castShadow, compose } from '../../lib/passes.ts';
import { Plot } from '../../lib/plot.ts';
import type { SpriteGenerator } from '../../lib/types.ts';

const W = 40;
const H = 20;
const GROUND = 18;
const R = 5;
/** The forecarriage's near wheel (the far one is hidden behind it, like the cart's). */
const WHEEL = { x: 8, y: GROUND - R } as const;

/** A wheel with a spoke cross (art-director M2-29 B3: 8 spokes at r 5 read as 4 holes; integer distances, no trig). */
function wheel(p: Plot, cx: number, cy: number): void {
  for (let dy = -R; dy <= R; dy++) {
    for (let dx = -R; dx <= R; dx++) {
      const d2 = dx * dx + dy * dy;
      if (d2 > R * R + R) continue;
      const rim = d2 >= (R - 1) * (R - 1);
      const hub = d2 === 0;
      const spoke = dx === 0 || dy === 0;
      if (rim) p.set(cx + dx, cy + dy, 'wood', dx + dy < 0 ? 3 : 1);
      else if (hub) p.set(cx + dx, cy + dy, 'wood', 5);
      else if (spoke) p.set(cx + dx, cy + dy, 'wood', dx + dy < 0 ? 4 : 2);
    }
  }
}

/** A 1-px line from (x0, y0) to (x1, y1), every px through `paint`. */
function line(x0: number, y0: number, x1: number, y1: number, paint: (x: number, y: number, k: number) => void): void {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let k = 0; k <= n; k++) {
    paint(x0 + Math.round(((x1 - x0) * k) / n), y0 + Math.round(((y1 - y0) * k) / n), k);
  }
}

const plough: SpriteGenerator = {
  atlas: 'khortytsia',
  id: 'plough',
  size: { w: W, h: H },
  frames: { idle: 1 },
  layers: ['shadow'],
  anchor: { x: 20 / W, y: (GROUND + 1) / H },
  generate(_rng, { buffer, layers, rampSize }) {
    const p = new Plot();
    // Forecarriage: the bolster block on top of the axle, the wheel in front of it.
    for (let x = WHEEL.x - 2; x <= WHEEL.x + 5; x++) {
      p.set(x, WHEEL.y - R - 2, 'wood', x <= WHEEL.x ? 5 : 4);
      p.set(x, WHEEL.y - R - 1, 'wood', 2);
    }
    wheel(p, WHEEL.x, WHEEL.y);
    // The beam: from the bolster back and down to the plough body, a lit top and a shaded underside.
    const beam = { x0: WHEEL.x + 1, y0: WHEEL.y - R - 3, x1: 29, y1: GROUND - 6 };
    line(beam.x0, beam.y0, beam.x1, beam.y1, (x, y) => {
      p.set(x, y, 'wood', x < 18 ? 5 : 4);
      p.set(x, y + 1, 'wood', 2);
    });
    // The coulter: an iron knife down through the beam, raked forward, its point just over the share's tip.
    line(21, GROUND - 9, 18, GROUND - 2, (x, y, k) => {
      p.set(x, y, 'stone', k <= 1 ? 6 : 4);
      p.set(x + 1, y, 'stone', 2);
    });
    // The post (стійка) from the beam's end down to the sole.
    for (let y = GROUND - 5; y <= GROUND - 2; y++) {
      p.set(28, y, 'wood', 3);
      p.set(29, y, 'wood', 1);
    }
    // The share: an iron wedge on the ground pointing forward (left), a lit top edge, fresh from the forge.
    for (let x = 16; x <= 29; x++) {
      const rows = x < 19 ? 1 : 2;
      for (let r = 0; r < rows; r++) p.set(x, GROUND - r, 'stone', r === rows - 1 ? (x < 23 ? 6 : 5) : 3);
    }
    // The mouldboard: a plank twisting up behind the share.
    for (let x = 23; x <= 30; x++) {
      const top = GROUND - 4 + (x < 25 ? 1 : 0);
      for (let y = top; y <= GROUND - 2; y++) p.set(x, y, 'wood', y === top ? 5 : x >= 29 ? 2 : 3);
    }
    // A clod of earth still on the share.
    p.set(20, GROUND - 2, 'earth', 3);
    p.set(21, GROUND - 2, 'earth', 2);
    // Two handles (чепіги) rising back to the right from the body: the far one 3 px on, darker; a rung between them.
    line(32, GROUND - 5, 38, GROUND - 14, (x, y) => {
      p.set(x, y, 'wood', 2);
    });
    line(28, GROUND - 4, 34, GROUND - 14, (x, y, k) => {
      p.set(x, y, 'wood', k >= 9 ? 5 : 4);
      p.set(x + 1, y, 'wood', 2);
    });
    for (let x = 32; x <= 34; x++) p.set(x, GROUND - 10, 'wood', 3);
    compose(buffer, [p.part(1, 1)], rampSize, {
      light: false,
      occlusion: false,
      outline: { mode: 'outer', drop: 2 },
      selective: { lit: 'vanish' },
    });
    if (layers.shadow) castShadow(layers.shadow, { x0: 9, x1: 33, groundY: GROUND, reach: 6, depth: 3 });
  },
};

export default plough;
