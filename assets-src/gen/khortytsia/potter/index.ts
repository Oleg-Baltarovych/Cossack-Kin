// Хата гончаря, tiers II, IV, V, VI (plan M2-07, ART-BIBLE §6 «Тіри господарських будівель»): the M-ART khata
// (`paintKhata`; tiers I and III stay `khata.t1` / `khata.t3`) in a wider canvas, grown by the potter's trade:
// II a clay stovepipe through the thatch; IV (on III) an open workshop shed on the left — a reed lean-to on carved
// posts over the potter's wheel and drying pots; V a drying rack with jugs under a narrow awning past the side wall;
// VI a taller chimney with a crimson-painted cap and a painted band (петриківка dots) under the eaves. The kiln
// (`kiln`, lit mouth at night), the jug bench (`jugs`) and the gold jug (`gilt.jug`, VI) are add-ons. Ramps: plaster,
// thatch, wood, earth, ink, crimson (gold only in the add-on, so the base keeps ≤ 6 ramps).
import type { IndexBuffer } from '../../lib/buffer.ts';
import { compose, type RampSize } from '../../lib/passes.ts';
import { Plot } from '../../lib/plot.ts';
import type { SpriteGenerator } from '../../lib/types.ts';
import { KHATA_GEOMETRY, KHATA_GROUND, KHATA_PIVOT_X, paintKhata } from '../khata/index.ts';

const OX = 12;
const OY = 4;
const W = 100;
const H = 60;
export const POTTER_GROUND = KHATA_GROUND + OY;
export const POTTER_PIVOT_X = KHATA_PIVOT_X + OX;

interface PotterTier {
  readonly tier3: boolean;
  /** Clay stovepipe (II) or whitewashed chimney height override (VI). */
  readonly stovepipe?: boolean;
  readonly shed?: boolean;
  readonly rack?: boolean;
  readonly painted?: boolean;
}

export const POTTER_TIERS: Readonly<Record<string, PotterTier>> = {
  t2: { tier3: false, stovepipe: true },
  t4: { tier3: true, shed: true },
  t5: { tier3: true, shed: true, rack: true },
  t6: { tier3: true, shed: true, rack: true, painted: true },
};

const { WALL, ROOF, WALL_TOP, PRYZBA_Y } = KHATA_GEOMETRY;

/** Upright clay pot: `rows` widths top → bottom; earth, lit upper left, shaded right, dark edge. */
function pot(p: Plot, cx: number, ground: number, rows: readonly number[]): void {
  const top = ground - rows.length + 1;
  rows.forEach((width, r) => {
    const half = (width - 1) / 2;
    for (let c = cx - half; c <= cx + half; c++) {
      const edge = c === cx - half || c === cx + half || r === rows.length - 1;
      let shade = 4;
      if (edge) shade = c === cx - half && r < rows.length - 1 ? 3 : 1;
      else if (c >= cx + half - 1) shade = 2;
      else if (r <= 2 && c <= cx - 1) shade = 5;
      p.set(c, top + r, 'earth', shade);
    }
  });
}
export const POT_SMALL = [3, 3, 5, 5, 3] as const;
export const POT_TALL = [3, 3, 5, 7, 7, 5, 3] as const;

/** A carved post: wood 4 lit left, wood 2 right, crimson notches every 3 rows. */
function carvedPost(p: Plot, x: number, top: number, bottom: number): void {
  for (let y = top; y <= bottom; y++) {
    const notch = (y - top) % 3 === 1;
    p.set(x, y, notch ? 'crimson' : 'wood', 3);
    p.set(x + 1, y, 'wood', 1);
  }
}

const potter: SpriteGenerator = {
  atlas: 'khortytsia',
  id: 'potter',
  size: { w: W, h: H },
  frames: { idle: 1 },
  variants: Object.keys(POTTER_TIERS),
  layers: ['emissive', 'shadow'],
  anchor: { x: POTTER_PIVOT_X / W, y: (POTTER_GROUND + 1) / H },
  generate(_rng, { variant, buffer, layers, rampSize }) {
    const t = POTTER_TIERS[variant ?? 't2'] ?? { tier3: false };
    const wallX = WALL.x + OX;
    const wallX1 = WALL.x + WALL.w + OX;
    const ground = POTTER_GROUND;
    const extras = new Plot();
    paintKhata(buffer, layers, rampSize, {
      seed: `potter.${variant ?? 't2'}`,
      ox: OX,
      oy: OY,
      tier3: t.tier3,
      ground,
      extras: ({ roof, body, ridgeX1 }) => {
        // Where tier III's whitewashed chimney stands.
        const ridgeX = ridgeX1 - 9;
        if (t.stovepipe) {
          // Clay stovepipe: 2 px earth 4 / 2, a sooty earth 1 lip.
          for (let r = -1; r < 5; r++) {
            roof.set(ridgeX, ROOF.top + OY + r, 'earth', 4);
            roof.set(ridgeX + 1, ROOF.top + OY + r, 'earth', 2);
          }
          roof.set(ridgeX, ROOF.top + OY - 2, 'earth', 2);
          roof.set(ridgeX + 1, ROOF.top + OY - 2, 'earth', 3);
        }
        if (t.painted) {
          // A tall chimney with a crimson-painted cap, then dots of петриківка along the eave band.
          const x = ridgeX;
          const top = ROOF.top + OY - 4;
          for (let r = 0; r < 10; r++) {
            roof.set(x, top + r, 'plaster', r < 2 ? 3 : 5);
            roof.set(x + 1, top + r, 'plaster', r < 2 ? 2 : 4);
            roof.set(x + 2, top + r, 'plaster', 3);
          }
          for (let c = 0; c <= 1; c++) roof.set(x + c, top + 2, 'crimson', 3 - c);
          roof.set(x + 1, top - 1, 'earth', 2);
          for (let c = wallX + 2; c < wallX1 - 9; c += 3) {
            body.set(c, WALL_TOP + OY + 3, 'crimson', 3);
            if ((c - wallX) % 6 === 2) body.set(c + 1, WALL_TOP + OY + 4, 'crimson', 2);
          }
        }
      },
    });

    // Firewood for the stove (II): split logs stacked under the right eave against the side wall.
    if (t.stovepipe) {
      for (let y = WALL_TOP + OY + 10; y < PRYZBA_Y + OY + 3; y++) {
        for (let x = wallX1; x < wallX1 + 3; x++) {
          const end = (y + x) % 3 === 0;
          extras.set(x, y, 'wood', end ? 3 : x === wallX1 + 2 ? 1 : 2);
        }
      }
    }
    // Workshop shed (IV+): reed lean-to falling left from under the eave, two carved posts, the wheel and pots under.
    if (t.shed) {
      const sx0 = wallX - 18;
      const roofHigh = WALL_TOP + OY + 1;
      for (let k = 0; k < 20; k++) {
        const x = wallX + 1 - k;
        const y = roofHigh + Math.floor(k * 0.45);
        for (let r = 0; r < 3; r++) extras.set(x, y + r, 'thatch', r === 0 ? 5 : r === 1 ? (x % 3 === 0 ? 3 : 4) : 2);
        extras.set(x, y + 3, 'thatch', x % 2 === 0 ? 1 : 2); // ragged hem
      }
      const lowY = roofHigh + Math.floor(19 * 0.45) + 3;
      carvedPost(extras, sx0 + 1, lowY + 1, ground);
      carvedPost(extras, wallX - 4, roofHigh + 5, ground);
      // Shade under the shed on the wall's foot, then the wheel: a disc on a stand, a pot on it.
      for (let y = lowY + 1; y < ground - 3; y++)
        for (let x = sx0 + 3; x < wallX - 4; x++) if ((x + y) % 2 === 0) extras.set(x, y, 'earth', 1);
      const wx = sx0 + 9;
      for (let x = wx - 3; x <= wx + 3; x++) extras.set(x, ground - 6, 'wood', x < wx ? 3 : 2);
      for (let y = ground - 5; y <= ground - 1; y++) extras.set(wx, y, 'wood', 1);
      for (let x = wx - 4; x <= wx + 4; x++) extras.set(x, ground, 'wood', x < wx ? 2 : 1);
      pot(extras, wx, ground - 7, POT_SMALL);
      pot(extras, sx0 + 4, ground, POT_SMALL);
      pot(extras, wallX - 7, ground - 1, POT_TALL);
    }
    // Drying rack (V+): two plank shelves past the side wall under a narrow reed awning, jugs upside down on them.
    if (t.rack) {
      const rx0 = wallX1 + 2;
      const rx1 = rx0 + 13;
      const aw = WALL_TOP + OY + 2;
      for (let x = rx0 - 1; x <= rx1 + 1; x++) {
        extras.set(x, aw, 'thatch', 4);
        extras.set(x, aw + 1, 'thatch', x % 2 === 0 ? 2 : 3);
        extras.set(x, aw + 2, 'thatch', 1);
      }
      for (const x of [rx0, rx1]) for (let y = aw + 3; y <= ground; y++) extras.set(x, y, 'wood', x === rx0 ? 3 : 1);
      for (const sy of [aw + 10, PRYZBA_Y + OY]) {
        for (let x = rx0; x <= rx1; x++) {
          extras.set(x, sy, 'wood', 3);
          extras.set(x, sy + 1, 'wood', 1);
        }
        for (const cx of [rx0 + 3, rx0 + 7, rx0 + 11]) pot(extras, cx, sy - 1, POT_SMALL);
      }
    }
    if (extras.px.size === 0) return;
    // Extras over the khata: a second compose into the same buffer, unoutlined and only in shades the khata already
    // uses (the colour budget: khata III alone is 24 colours).
    paintExtras(buffer, extras, rampSize);
  },
};

function paintExtras(buffer: IndexBuffer, extras: Plot, rampSize: RampSize): void {
  compose(buffer, [extras.part(3, 3)], rampSize, {
    light: false,
    occlusion: false,
  });
}

export default potter;
