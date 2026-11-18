// Придорожній хрест — a roadside wooden cross under a little gable roof, a вишитий рушник tied to its arm (plan M2-01
// seam review: the suburb's focal object; folk, not a state symbol — SPEC §16). Post and arm of squared timber (wood 3
// face, wood 5 warm lit left edge, wood 2 right), a two-plank дашок over the head (wood 2/1, lit ridge), the рушник hanging
// from the left arm (plaster 5/6 with two crimson stitch rows and a fringe). 20×46, pivot at the base; cast shadow.
import { castShadow, compose } from '../../lib/passes.ts';
import { Plot } from '../../lib/plot.ts';
import type { SpriteGenerator } from '../../lib/types.ts';

const W = 20;
const H = 46;
export const CROSS_GROUND = 44;
const POST = { x: 9, w: 3, top: 6 };
const ARM = { y: 14, x0: 3, x1: 17 };

const cross: SpriteGenerator = {
  atlas: 'khortytsia',
  id: 'cross',
  size: { w: W, h: H },
  frames: { idle: 1 },
  layers: ['shadow'],
  anchor: { x: 0.5, y: (CROSS_GROUND + 1) / H },
  generate(_rng, { buffer, layers, rampSize }) {
    const wood = new Plot();
    // Post: squared timber, lit on the left; a darker foot where it is dug in.
    for (let y = POST.top; y <= CROSS_GROUND; y++) {
      for (let dx = 0; dx < POST.w; dx++) {
        const shade = dx === 0 ? 5 : dx === POST.w - 1 ? 2 : 3;
        wood.set(POST.x + dx, y, 'wood', y >= CROSS_GROUND - 1 ? Math.max(1, shade - 1) : shade);
      }
    }
    // Arm: 2 rows, lit top row.
    for (let x = ARM.x0; x <= ARM.x1; x++) {
      wood.set(x, ARM.y, 'wood', 4);
      wood.set(x, ARM.y + 1, 'wood', x > POST.x + 1 ? 2 : 3);
    }
    // Дашок: two planks meeting over the head, the ridge lit.
    const roof = new Plot();
    for (let i = 0; i < 7; i++) {
      const y = 1 + i;
      roof.set(POST.x + 1 - i, y, 'wood', i === 0 ? 5 : 2);
      roof.set(POST.x - i, y, 'wood', 1);
      roof.set(POST.x + 1 + i, y, 'wood', i === 0 ? 5 : 2);
      roof.set(POST.x + 2 + i, y, 'wood', 1);
    }
    // Голубець: one dark row joins the roof to the head of the post under its ridge.
    for (let x = POST.x - 1; x <= POST.x + POST.w; x++) roof.set(x, POST.top - 1, 'wood', 1);
    // Рушник tied to the left arm: a white strip with two crimson stitch rows and a fringe.
    const cloth = new Plot();
    for (let y = ARM.y + 2; y < ARM.y + 13; y++) {
      for (const x of [ARM.x0 + 1, ARM.x0 + 2]) {
        const stitch = y === ARM.y + 5 || y === ARM.y + 9;
        cloth.set(x, y, stitch ? 'crimson' : 'plaster', stitch ? 3 : x === ARM.x0 + 1 ? 6 : 5);
      }
    }
    cloth.set(ARM.x0 + 1, ARM.y + 13, 'plaster', 4);
    compose(buffer, [wood.part(1, 1), roof.part(2, 2), cloth.part(3, 3)], rampSize, {
      light: false,
      occlusion: false,
      outline: { mode: 'outer' },
      selective: { lit: 'vanish' },
    });
    if (layers.shadow)
      castShadow(layers.shadow, { x0: POST.x, x1: POST.x + POST.w + 1, groundY: CROSS_GROUND, reach: 8 });
  },
};

export default cross;
