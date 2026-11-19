// Скарбниця, tiers I–IV (plan M2-09, ART-BIBLE §6 «скарбниця — льох із масивними дверима»): a half-sunk cellar under
// a turfed earth mound (grass cap lit top-left, earth sides, a dark foot), its entrance facing the viewer. I a low
// mound, a plank door in a simple log portal; II a log portal under a plank gable, the door iron-banded with a padlock;
// III a bigger mound, a stone portal under a small shingle roof, a lantern by the door (lit at night); IV wider, carved
// crimson-and-gold trim on the portal, a gilt lock and a gold cross on the gable, a powder keg and an iron-bound chest
// beside the door. Ramps: grass, earth, wood, stone (+ gold, crimson). 80×48, pivot at the base.
import { castShadow, compose } from '../../lib/passes.ts';
import { Plot } from '../../lib/plot.ts';
import { barrel, plankDoor, timberPost } from '../../lib/recipes-suburb.ts';
import type { SpriteGenerator } from '../../lib/types.ts';

const W = 80;
const H = 48;
export const TREASURY_GROUND = 45;
export const TREASURY_PIVOT_X = 36;

type Portal = 'log' | 'gable' | 'stone';

interface TreasuryTier {
  /** Mound width and height. */
  readonly mound: readonly [number, number];
  /** Door width and height. */
  readonly door: readonly [number, number];
  readonly portal: Portal;
  readonly lantern?: boolean;
  readonly carved?: boolean;
}

export const TREASURY_TIERS: Readonly<Record<string, TreasuryTier>> = {
  t1: { mound: [44, 22], door: [8, 11], portal: 'log' },
  t2: { mound: [48, 24], door: [9, 12], portal: 'gable' },
  t3: { mound: [56, 28], door: [9, 13], portal: 'stone', lantern: true },
  t4: { mound: [62, 30], door: [9, 13], portal: 'stone', lantern: true, carved: true },
};

/** Position hash in [0, 1): stable texture without an RNG stream. */
const hash = (x: number, y: number): number => ((((x * 73856093) ^ (y * 19349663)) >>> 0) % 1000) / 1000;

/** The turfed mound: a half ellipse, a ragged grass cap 4–6 rows deep over earth sides, tufts on the crest. */
function mound(plot: Plot, cx: number, g: number, w: number, h: number): void {
  const rx = w / 2;
  const tops = new Map<number, number>();
  for (let y = g - h + 1; y <= g; y++) {
    const v = (g + 1 - y) / h;
    const half = Math.round(rx * Math.sqrt(Math.max(0, 1 - v * v)));
    for (let c = cx - half; c <= cx + half; c++) if (!tops.has(c)) tops.set(c, y);
  }
  for (const [c, top] of tops) {
    const u = (c - cx) / rx;
    const turf = top + 4 + (hash(c, 1) < 0.5 ? 1 : 0) + (c % 3 === 0 ? 1 : 0);
    for (let y = top; y <= g; y++) {
      if (y < turf) {
        let shade = u < -0.45 ? 5 : u < 0.15 ? 4 : u < 0.6 ? 3 : 2;
        if (y === turf - 1) shade = Math.max(2, shade - 1);
        plot.set(c, y, 'grass', shade);
        continue;
      }
      let shade = u < -0.4 ? 4 : u < 0.45 ? 3 : 2;
      if (y === turf) shade = 2; // the turf's shadow on the earth
      if (y === g) shade = Math.min(shade, 2);
      if (hash(c, y) < 0.06) shade = Math.max(2, shade - 1); // clods
      plot.set(c, y, 'earth', shade);
    }
    // Tufts: a blade above the crest every few columns.
    if (hash(c, 7) < 0.22 && Math.abs(u) < 0.85) plot.set(c, top - 1, 'grass', u < 0 ? 5 : 3);
  }
}

/** A horizontal log `w` long at (x, y): lit top, body, dark underside, ring ends. */
function lintelLog(plot: Plot, x: number, y: number, w: number): void {
  for (let c = 0; c < w; c++) {
    const right = c > w * 0.7;
    plot.set(x + c, y, 'wood', right ? 3 : 4);
    plot.set(x + c, y + 1, 'wood', right ? 2 : 3);
    plot.set(x + c, y + 2, 'wood', 1);
  }
  plot.set(x, y + 1, 'wood', 5);
  plot.set(x + w - 1, y + 1, 'wood', 2);
}

const treasury: SpriteGenerator = {
  atlas: 'khortytsia',
  id: 'treasury',
  size: { w: W, h: H },
  frames: { idle: 1 },
  variants: Object.keys(TREASURY_TIERS),
  layers: ['emissive', 'shadow'],
  anchor: { x: TREASURY_PIVOT_X / W, y: (TREASURY_GROUND + 1) / H },
  generate(_rng, { variant, buffer, layers, rampSize }) {
    const t = TREASURY_TIERS[variant ?? 't1'] ?? { mound: [44, 22], door: [8, 11], portal: 'log' };
    const cx = TREASURY_PIVOT_X;
    const g = TREASURY_GROUND;
    const [mw, mh] = t.mound;
    const [dw, dh] = t.door;
    const dx0 = cx - Math.floor(dw / 2);
    const dx1 = dx0 + dw;
    const doorTop = g - dh + 1;

    const earth = new Plot();
    mound(earth, cx, g, mw, mh);

    // Portal and door.
    const portal = new Plot();
    const glow = new Plot();
    const jamb = t.portal === 'stone' ? 3 : t.portal === 'gable' ? 3 : 2;
    const [px0, px1] = [dx0 - jamb, dx1 + jamb];
    const lintel = doorTop - 3;
    // The cut in the mound around the portal: a dark earth reveal.
    for (let y = lintel - 1; y < g; y++) {
      for (let x = px0 - 2; x < px1 + 2; x++) if (earth.has(x, y)) earth.set(x, y, 'earth', x < px0 ? 2 : 1);
    }
    if (t.portal === 'stone') {
      // Dressed stone jambs and a lintel slab: blocks 3 rows tall, joints stone 1, lit left faces.
      for (let y = lintel; y <= g; y++) {
        for (let x = px0; x < px1; x++) {
          if (x >= dx0 && x < dx1 && y >= doorTop) continue;
          const course = y < doorTop ? 0 : Math.floor((y - doorTop) / 3) + 1;
          const joint = (y - lintel) % 3 === 2 || (y < doorTop && (x - px0) % 5 === 4);
          const side = x < dx0 ? x - px0 : x - dx1;
          const shade = joint ? 1 : side === 0 || (y === lintel && x < cx) ? 4 : side === jamb - 1 ? 2 : 3;
          portal.set(x, y, 'stone', course % 2 === 1 && side === 1 && !joint ? 3 : shade);
        }
      }
      for (let x = px0 - 1; x <= px1; x++) portal.set(x, g, 'stone', x < cx ? 3 : 2); // the threshold step
    } else {
      for (const x of [px0, dx1]) timberPost(portal, x, lintel + 1, g, jamb === 3 ? 3 : 2);
      lintelLog(portal, px0 - 2, lintel - 1, px1 - px0 + 4);
    }
    plankDoor(portal, dx0, doorTop, dw, dh);
    // A 1-px warm rim on the door frame's lit top and left edges (art-director M2-09: the door reads off the mound).
    for (let x = dx0; x < dx1; x++) portal.set(x, doorTop, 'wood', 5);
    for (let y = doorTop; y < g; y++) portal.set(dx0, y, 'wood', 5);
    if (t.portal !== 'log') {
      // Iron bands with a lit rivet, and the padlock (gilt at IV).
      for (const by of [doorTop + 2, g - 2]) {
        for (let x = dx0 + 1; x < dx1 - 1; x++) portal.set(x, by, 'stone', x === dx0 + 1 ? 4 : 2);
      }
      const lock = t.carved ? 'gold' : 'stone';
      const lx = dx1 - 4;
      const ly = doorTop + Math.floor(dh / 2);
      portal.set(lx, ly - 1, lock, 3);
      portal.set(lx + 1, ly - 2, lock, 3);
      portal.set(lx + 2, ly - 1, lock, 3);
      for (let k = 0; k < 3; k++) {
        portal.set(lx + k, ly, lock, k === 0 ? 4 : 3);
        portal.set(lx + k, ly + 1, lock, 3);
      }
    }

    // Gable (II) or a small shingle roof (III–IV) over the entrance.
    const roof = new Plot();
    const rw = px1 - px0 + (t.portal === 'stone' ? 8 : 4);
    const rh = t.portal === 'stone' ? 8 : 7;
    const rx0 = cx - Math.floor(rw / 2);
    if (t.portal !== 'log') {
      const base = lintel - 2;
      for (let r = 0; r < rh; r++) {
        const y = base - rh + 1 + r;
        const half = Math.round(((r + 1) * rw) / (2 * rh));
        for (let x = cx - half; x < cx + half; x++) {
          const left = x < cx;
          const edge = x < cx - half + 2 || x >= cx + half - 2;
          let shade: number;
          if (t.portal === 'gable') {
            shade = edge ? (left ? 5 : 1) : (x - cx) % 2 === 0 ? 2 : left ? 3 : 2;
          } else {
            const shingle = (x + (r % 2) * 2) % 4 === 0;
            shade = left ? (shingle ? 5 : 4) : shingle ? 1 : 2;
            if (r === rh - 1) shade = left ? 2 : 1;
          }
          roof.set(x, y, 'wood', shade);
        }
      }
      if (t.portal === 'gable') for (let x = rx0; x < rx0 + rw; x++) roof.set(x, base + 1, 'wood', x < cx ? 3 : 1);
    }

    // Lantern on a bracket by the right jamb (lit at night).
    const front = new Plot();
    if (t.lantern) {
      const lx = px1 + 2;
      const ly = doorTop + 1;
      front.set(px1, ly - 1, 'wood', 2);
      front.set(px1 + 1, ly - 1, 'wood', 2);
      front.set(lx, ly - 1, 'stone', 2);
      for (let r = 0; r < 5; r++) {
        for (let c = -1; c <= 1; c++) {
          const frame = r === 0 || r === 4 || c !== 0;
          if (frame) front.set(lx + c, ly + r, 'stone', r === 0 ? 3 : 1);
          else {
            front.set(lx + c, ly + r, 'gold', 4);
            glow.set(lx + c, ly + r, 'gold', 5);
          }
        }
      }
    }

    // IV: carved crimson trim along the roof's eave and the lintel, a gold cross on the gable, a keg and a chest.
    const trim = new Plot();
    if (t.carved) {
      const base = lintel - 2;
      for (let x = rx0; x < rx0 + rw; x++) {
        const stud = (x - rx0) % 3 === 1;
        trim.set(x, base, stud ? 'gold' : 'crimson', stud ? 4 : x < cx ? 4 : 3);
        if ((x & 1) === 0) trim.set(x, base + 1, 'crimson', 3);
      }
      const ty = base - rh + 3;
      for (let k = 0; k < 4; k++) trim.set(cx, ty + k, 'gold', k < 2 ? 4 : 3);
      trim.set(cx - 1, ty + 1, 'gold', 4);
      trim.set(cx + 1, ty + 1, 'gold', 3);
      const keg = new Plot();
      barrel(keg, px0 - 7, g, 8);
      for (const [key, p] of keg.px) {
        // Iron hoops in stone (no ink ramp), the shaded staves wood 2 (the outline adds no wood 0): the budget.
        front.px.set(key, p.ramp === 'ink' ? { ramp: 'stone', shade: 2 } : { ...p, shade: Math.max(2, p.shade) });
      }
      const chestX = px1 + 5;
      for (let r = 0; r < 7; r++) {
        for (let c = 0; c < 10; c++) {
          const band = c === 2 || c === 7;
          const lid = r < 2;
          const shade = lid ? (r === 0 ? 4 : 2) : c === 9 ? 2 : c === 0 ? 4 : 3;
          if (band) front.set(chestX + c, g - 6 + r, 'stone', r === 0 ? 3 : 2);
          else front.set(chestX + c, g - 6 + r, 'wood', r === 6 ? 2 : shade);
        }
      }
      front.set(chestX + 4, g - 4, 'stone', 3);
      front.set(chestX + 5, g - 4, 'stone', 2);
    }

    compose(
      buffer,
      [earth.part(1, 1), portal.part(2, 2), roof.part(3, 3), front.part(4, 4, glow), trim.part(5, 5)],
      rampSize,
      {
        light: false,
        occlusion: false,
        outline: { mode: 'outer', drop: 1, parts: [1, 3, 4] },
        selective: { lit: 'vanish' },
        ...(layers.emissive ? { emissive: layers.emissive } : {}),
      },
    );
    if (layers.shadow) castShadow(layers.shadow, { x0: cx, x1: cx + Math.floor(mw / 2) + 1, groundY: g });
  },
};

export default treasury;
