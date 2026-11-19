// Шинок, tiers I–VI (plan M2-08, ART-BIBLE §6 «шинок (більша хата з ґанком і вивіскою-віником)»): a whitewashed
// house under a hipped reed roof in the khata's 3/4 view (lit front face, shaded side wall under the right hip), longer
// than a khata and growing with the trade. I one window and the plank door; II longer, two windows, a bench by the
// wall; III a porch (ґанок) over the door on two posts, a рушник, the chimney; IV three windows, carved porch posts
// (crimson notches), a plank storeroom (комора) against the left end; V longer still with an open cart shed (заїзд)
// on the right for the guests' horses and carts; VI a painted band (петриківка dots) under the eaves and a taller
// chimney. The віхоть on its pole (`broom-sign`, the tavern's sign), the hitching rail, the barrels and the gilt jug
// (VI) are add-ons. Windows `@emissive`. Ramps: plaster, thatch, wood, ink, crimson (no pryzba, no clay patch: the
// budget). 132×72, pivot at the base.
import { castShadow, compose } from '../../lib/passes.ts';
import { Plot } from '../../lib/plot.ts';
import {
  eaveAO,
  rushnyk,
  sideWall,
  thatchRoof,
  whitewashWall,
  WINDOW,
  windowRecipe,
  type Rect,
} from '../../lib/recipes.ts';
import { daubChimney, plankDoor, softenThatch, timberPost } from '../../lib/recipes-suburb.ts';
import type { SpriteGenerator } from '../../lib/types.ts';

const W = 132;
const H = 72;
export const TAVERN_GROUND = 68;
export const TAVERN_PIVOT_X = 60;
/** Side wall under the right hip. */
const SIDE = 9;
const WALL_H = 20;
const WALL_TOP = TAVERN_GROUND - WALL_H + 1;
const LIP = WALL_TOP - 3;
const DOOR = { w: 7, h: 13 } as const;

interface TavernTier {
  /** Wall span (offsets from the pivot), ridge height above the lip. */
  readonly wall: readonly [number, number];
  readonly rise: number;
  readonly windows: number;
  readonly bench?: boolean;
  readonly porch?: boolean;
  readonly carved?: boolean;
  readonly chimney?: number;
  /** Plank storeroom against the left end: its outer x. */
  readonly komora?: number;
  /** Open cart shed on the right: its outer x. */
  readonly shed?: number;
  readonly painted?: boolean;
}

export const TAVERN_TIERS: Readonly<Record<string, TavernTier>> = {
  t1: { wall: [-22, 22], rise: 21, windows: 1 },
  t2: { wall: [-26, 26], rise: 22, windows: 2, bench: true },
  t3: { wall: [-30, 30], rise: 23, windows: 2, bench: true, porch: true, chimney: 7 },
  t4: { wall: [-34, 34], rise: 24, windows: 3, porch: true, carved: true, chimney: 7, komora: -48 },
  t5: { wall: [-36, 36], rise: 25, windows: 3, porch: true, carved: true, chimney: 7, komora: -50, shed: 58 },
  t6: {
    wall: [-38, 38],
    rise: 25,
    windows: 3,
    porch: true,
    carved: true,
    chimney: 11,
    komora: -52,
    shed: 62,
    painted: true,
  },
};

/** Where the door is on tier `variant` (offset of its centre from the pivot): the sign pole stands beside it. */
export function tavernDoor(variant: string): number {
  const t = TAVERN_TIERS[variant] ?? TAVERN_TIERS.t1;
  const [w0, w1] = t?.wall ?? [-22, 22];
  const front = w1 - SIDE - w0;
  return w0 + Math.round(front * 0.62);
}

const tavern: SpriteGenerator = {
  atlas: 'khortytsia',
  id: 'tavern',
  size: { w: W, h: H },
  frames: { idle: 1 },
  variants: Object.keys(TAVERN_TIERS),
  layers: ['emissive', 'shadow'],
  anchor: { x: TAVERN_PIVOT_X / W, y: (TAVERN_GROUND + 1) / H },
  generate(_rng, { variant, buffer, layers, rampSize }) {
    const v = variant ?? 't1';
    const seed = `tavern.${v}`;
    const t = TAVERN_TIERS[v] ?? { wall: [-22, 22], rise: 21, windows: 1 };
    const cx = TAVERN_PIVOT_X;
    const g = TAVERN_GROUND;
    const x0 = cx + t.wall[0];
    const x1 = cx + t.wall[1];
    const frontW = x1 - x0 - SIDE;
    const doorX = cx + tavernDoor(v) - Math.floor(DOOR.w / 2);

    // Windows spread over the front face, clear of the door.
    const winY = WALL_TOP + 4;
    const slots = Array.from(
      { length: t.windows + 1 },
      (_, i) => x0 + Math.round(((i + 0.5) * frontW) / (t.windows + 1)),
    );
    const windows: Rect[] = slots
      .map((sx) => sx - Math.floor(WINDOW.w / 2))
      .filter((wx) => wx + WINDOW.w + 2 <= doorX || wx >= doorX + DOOR.w + 2)
      .slice(0, t.windows)
      .map((wx) => ({ x: wx, y: winY, w: WINDOW.w, h: WINDOW.h + 1 }));
    const door: Rect = { x: doorX, y: g - DOOR.h + 1, w: DOOR.w, h: DOOR.h };

    const body = new Plot();
    const glow = new Plot();
    whitewashWall(body, {
      seed,
      x: x0,
      y: WALL_TOP,
      w: frontW,
      h: g - WALL_TOP + 1,
      avoid: [...windows, door],
      aoRows: 2,
      clay: false,
      shadeEdge: false,
    });
    eaveAO(body, x0, x0 + frontW, WALL_TOP);
    sideWall(body, { x: x0 + frontW, y: WALL_TOP, w: SIDE, h: g - WALL_TOP + 1 });
    for (const win of windows) windowRecipe(body, glow, win.x, win.y);
    plankDoor(body, door.x, door.y, door.w, door.h);
    const first = windows[0];
    if (t.porch && first) rushnyk(body, first);
    if (t.painted) {
      // Петриківка under the eaves: crimson berries with a dark stem dot, every 4 px along the front face.
      for (let x = x0 + 2; x < x0 + frontW - 2; x += 4) {
        body.set(x, WALL_TOP + 2, 'crimson', 3);
        body.set(x + 1, WALL_TOP + 2, 'crimson', 2);
        body.set(x + 2, WALL_TOP + 3, 'wood', 1);
      }
    }
    if (t.bench) {
      // A plank bench along the wall left of the door.
      const bx0 = x0 + 2;
      const bx1 = Math.min(doorX - 3, bx0 + 16);
      for (let x = bx0; x <= bx1; x++) {
        body.set(x, g - 5, 'wood', 4);
        body.set(x, g - 4, 'wood', 2);
      }
      for (const lx of [bx0 + 1, bx1 - 1]) for (let y = g - 3; y <= g; y++) body.set(lx, y, 'wood', 1);
    }

    // Storeroom (комора): a plank wall with its own low door under a lean-to of reed against the left end.
    const extra = new Plot();
    if (t.komora !== undefined) {
      const k0 = cx + t.komora;
      for (let y = WALL_TOP + 3; y <= g; y++) {
        for (let x = k0; x < x0; x++) {
          const seam = (x - k0) % 3 === 2;
          extra.set(x, y, 'wood', seam ? 1 : x === k0 ? 4 : y < WALL_TOP + 5 ? 2 : 3);
        }
      }
      plankDoor(extra, k0 + 3, g - 10, 6, 11);
      for (let x = k0 - 2; x < x0 + 1; x++) {
        const y = WALL_TOP - 1 + Math.floor(((x0 - x) * 3) / (x0 - k0 + 2));
        extra.set(x, y, 'thatch', 4);
        extra.set(x, y + 1, 'thatch', 2);
        extra.set(x, y + 2, 'thatch', 1);
      }
    }
    // Cart shed (заїзд): reed roof on three posts past the right end, open to the yard.
    if (t.shed !== undefined) {
      const s1 = cx + t.shed;
      for (const px of [x1 + 1, Math.round((x1 + s1) / 2), s1 - 2]) timberPost(extra, px, WALL_TOP + 2, g, 2);
      for (let x = x1; x <= s1; x++) {
        const y = WALL_TOP - 2 + Math.floor(((x - x1) * 3) / Math.max(1, s1 - x1));
        extra.set(x, y, 'thatch', (x - x1) % 5 === 0 ? 3 : 4);
        extra.set(x, y + 1, 'thatch', 2);
        extra.set(x, y + 2, 'thatch', 1);
        extra.set(x, y + 3, 'ink', 1);
      }
    }

    const roof = new Plot();
    const info = thatchRoof(roof, {
      seed,
      x: x0 - 3,
      w: x1 - x0 + 6,
      top: LIP - t.rise,
      lip: LIP,
      hipFoot: { left: 0.45, right: 0.9 },
    });
    softenThatch(roof);
    // The chimney is drawn over the roof without an outline.
    const flue = new Plot();
    if (t.chimney !== undefined) daubChimney(flue, info.ridgeX1 - 10, LIP - t.rise - t.chimney + 7, t.chimney);

    // Porch (ґанок): a small gable of planks over the door on two posts (carved: crimson notches from IV).
    const porch = new Plot();
    if (t.porch) {
      const p0 = door.x - 3;
      const p1 = door.x + door.w + 2;
      for (const px of [p0, p1 - 1]) {
        for (let y = door.y - 3; y <= g; y++) {
          const notch = t.carved === true && (y - door.y) % 3 === 1;
          porch.set(px, y, notch ? 'crimson' : 'wood', notch ? 3 : px === p0 ? 4 : 2);
        }
      }
      const mid = Math.floor((p0 + p1) / 2);
      for (let k = 0; k <= Math.ceil((p1 - p0) / 2) + 1; k++) {
        const y = door.y - 4 - Math.max(0, Math.ceil((p1 - p0) / 2) - k);
        porch.set(p0 - 1 + k, y, 'wood', 4);
        porch.set(p1 - k, y, 'wood', 2);
        porch.set(p0 - 1 + k, y + 1, 'wood', 1);
        porch.set(p1 - k, y + 1, 'wood', 1);
      }
      porch.set(mid, door.y - 4 - Math.ceil((p1 - p0) / 2), 'wood', 5);
    }

    // Whitewash two steps down (art-director M2-08): at night the long wall read brighter than its windows, so the
    // lit front is plaster 4 (not 5–6), the corner 3, the side wall 2 — the windows stay the focal point.
    const REMAP = [1, 1, 1, 2, 3, 4, 4] as const;
    for (const [key, px] of body.px) {
      if (px.ramp === 'plaster') body.px.set(key, { ...px, shade: REMAP[px.shade] ?? px.shade });
    }

    compose(
      buffer,
      [body.part(2, 2, glow), extra.part(3, 3), roof.part(1, 1), flue.part(5, 5), porch.part(4, 4)],
      rampSize,
      {
        light: false,
        occlusion: false,
        outline: { mode: 'outer', parts: [1, 3, 4] },
        selective: { lit: 'vanish' },
        ...(layers.emissive ? { emissive: layers.emissive } : {}),
      },
    );
    if (layers.shadow)
      castShadow(layers.shadow, { x0: cx, x1: (t.shed !== undefined ? cx + t.shed : x1) + 1, groundY: g });
  },
};

export default tavern;
