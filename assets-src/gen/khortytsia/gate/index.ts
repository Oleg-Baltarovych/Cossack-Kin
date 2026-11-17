// Брама — the Sich gate (plan ART-11, ART-BIBLE §6: a tower over the passage with the crimson корогва; the zone's
// accent): two log pylons and an open passage — the steppe and a strip of sky show through it, one plank leaf swung
// back against the left pylon — a crimson-and-gold band and a lantern (lit at night) over the lintel, a log upper
// storey with two lit windows, a broad шатро roof, and the crimson корогва with a gold cross on a tall pole.
// 80×112 (larger than the towers: the accent of the zone), pivot at the base.
import { castShadow, compose } from '../../lib/passes.ts';
import { Plot } from '../../lib/plot.ts';
import { banner, logWall, opening, tentRoof } from '../../lib/recipes-sich.ts';
import type { SpriteGenerator } from '../../lib/types.ts';

const W = 80;
const H = 112;
export const GATE_GROUND = 110;
const STOREY = { x: 8, w: 60, top: 44, bottom: 64 };
const PASSAGE = { x: 25, w: 26 };
const PYLON = { left: 10, right: 66 };

const gate: SpriteGenerator = {
  atlas: 'khortytsia',
  id: 'gate',
  size: { w: W, h: H },
  frames: { idle: 1 },
  layers: ['emissive', 'shadow'],
  anchor: { x: 38 / W, y: (GATE_GROUND + 1) / H },
  generate(_rng, { buffer, layers, rampSize }) {
    const body = new Plot();
    const glow = new Plot();
    const pylonH = GATE_GROUND + 1 - STOREY.bottom;
    const rx = PASSAGE.x + PASSAGE.w;
    logWall(body, {
      seed: 'gate:l',
      x: PYLON.left,
      y: STOREY.bottom,
      w: PASSAGE.x - PYLON.left,
      h: pylonH,
      ends: true,
    });
    logWall(body, { seed: 'gate:r', x: rx, y: STOREY.bottom, w: PYLON.right - rx, h: pylonH, ends: true });
    // The passage: dark under the lintel, then the open view outside — a sky strip (water 6/5), the far steppe
    // (grass 3/2) and the trodden road (earth 4) running out of the gate. It reads as open, not as a door.
    const horizonRow = STOREY.bottom + 14;
    for (let y = STOREY.bottom; y <= GATE_GROUND; y++) {
      for (let x = PASSAGE.x; x < rx; x++) {
        const edge = x === PASSAGE.x || x === rx - 1;
        if (y < STOREY.bottom + 4 || edge) body.set(x, y, 'ink', 2);
        // Sky strip a step down from the open sky (water 4/3), so at night the lantern stays the brightest point.
        else if (y < horizonRow - 4) body.set(x, y, 'water', 4);
        else if (y < horizonRow) body.set(x, y, 'water', 3);
        else {
          const road = Math.abs(x - (PASSAGE.x + PASSAGE.w / 2)) < 3 + (y - horizonRow) / 4;
          body.set(x, y, road ? 'earth' : 'grass', road ? 4 : y < horizonRow + 4 ? 3 : 2);
        }
      }
    }
    // One plank leaf swung back against the left pylon: vertical boards, 1-px gaps, iron bands, a lit wood 4 edge.
    for (let y = STOREY.bottom + 4; y <= GATE_GROUND; y++) {
      for (let x = PASSAGE.x; x < PASSAGE.x + 6; x++) {
        const gap = (x - PASSAGE.x) % 3 === 2;
        const band = y === STOREY.bottom + 9 || y === GATE_GROUND - 6;
        if (band) body.set(x, y, 'stone', 2);
        else body.set(x, y, 'wood', x === PASSAGE.x + 5 ? 4 : gap ? 1 : 3);
      }
    }
    // Upper storey bridging the passage, with two lit windows.
    logWall(body, {
      seed: 'gate:storey',
      x: STOREY.x,
      y: STOREY.top,
      w: STOREY.w,
      h: STOREY.bottom - STOREY.top,
      ends: true,
    });
    opening(body, glow, { x: STOREY.x + 13, y: STOREY.top + 6, w: 5, h: 6 }, 1);
    opening(body, glow, { x: STOREY.x + 42, y: STOREY.top + 6, w: 5, h: 6 }, 1);
    // Lintel: a 2-px crimson band with gold studs over the passage, and a lantern hanging from it (lit at night).
    for (let x = PASSAGE.x - 2; x < rx + 2; x++) {
      body.set(x, STOREY.bottom, 'crimson', (x & 3) === 0 ? 4 : 3);
      body.set(x, STOREY.bottom + 1, (x & 3) === 2 ? 'gold' : 'crimson', (x & 3) === 2 ? 4 : 2);
    }
    const lx = PASSAGE.x + PASSAGE.w - 5;
    body.set(lx, STOREY.bottom + 2, 'wood', 1);
    for (let y = STOREY.bottom + 3; y < STOREY.bottom + 6; y++) {
      for (let x = lx - 1; x <= lx + 1; x++) {
        const frame = x !== lx || y === STOREY.bottom + 3;
        if (frame) body.set(x, y, 'wood', 1);
        else {
          body.set(x, y, 'gold', 4);
          glow.set(x, y, 'gold', 5);
        }
      }
    }
    const roof = new Plot();
    tentRoof(roof, STOREY.x + STOREY.w / 2, 14, STOREY.top, STOREY.w + 8);
    // The корогва on a tall pole beside the roof: crimson against the sky, the zone's accent.
    const flag = new Plot();
    banner(flag, 66, 2, 44, 11, 10);
    compose(buffer, [body.part(1, 1, glow), roof.part(2, 2), flag.part(3, 3)], rampSize, {
      light: false,
      occlusion: false,
      outline: { mode: 'outer', parts: [2] },
      selective: { lit: 'vanish' },
      ...(layers.emissive ? { emissive: layers.emissive } : {}),
    });
    if (layers.shadow) castShadow(layers.shadow, { x0: 38, x1: PYLON.right + 1, groundY: GATE_GROUND });
  },
};

export default gate;
