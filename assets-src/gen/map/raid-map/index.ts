// Мапа Низу Дніпра (plan M3-10, Q11; SPEC §3.4 «мапа регіонів»): the raid board's map — an old map on parchment,
// seen from above, north up, drawn in sepia ink with a light hand-coloured wash. The Dnipro comes down from the north,
// takes the Samara from the east, runs south through the rapids (9 stone ridges between granite banks) to Khortytsia,
// then turns south-west into the Velykyi Luh — a green floodplain of channels, lakes and oak groves between the Dnipro
// and the Kinski Vody (Konka) — and on past the Tavan crossing. The Vovcha joins the Samara far in the eastern steppe,
// the Bazavluk comes into the Luh from the north-west; kurgans dot the steppe; a dotted chumak road reaches the Tavan
// ford. A compass rose and a thin double rule with corner rhombi; no lettering (region names are i18n in the DOM,
// M3-11), no state symbols and no enemy (SPEC §16). Markers (`raid-marker`, `raid-squad`) sit on it at REGIONS
// (content/raids.ts) — the geography below is the source the content test checks the regions against.
// Flat (top-down, no light pass): every px is placed by role. Integer and + − × ÷ / sqrt math only (types.ts).
// 180×150 = RAID_MAP, pivot top-left so map px = frame px. Budget (ART-BIBLE §2 map rules): ≤ 24 colours, ≤ 6 ramps.
import { RAID_MAP } from '../../../../src/content/raids.ts';
import type { RampName } from '../../lib/buffer.ts';
import { fbm, q8, rand2, seedOf, valueNoise } from '../../lib/noise.ts';
import { Plot } from '../../lib/plot.ts';
import type { SpriteGenerator } from '../../lib/types.ts';

const W = RAID_MAP.w;
const H = RAID_MAP.h;
/** The double rule: outer line, inner line (inset px); the drawing lives inside the inner one. */
export const MAP_FRAME = { outer: 3, inner: 5 } as const;

/** A river's centreline: [x, y, width] in map px (width = water across, banks outside it). */
export type RiverPt = readonly [x: number, y: number, w: number];
export type RiverId = 'dnipro' | 'samara' | 'vovcha' | 'konka' | 'bazavluk';

export const RIVERS: Readonly<Record<RiverId, readonly RiverPt[]>> = {
  dnipro: [
    [78, 0, 7],
    [79, 8, 7],
    [81, 16, 7],
    [83, 23, 7],
    [85, 28, 5],
    [88, 35, 5],
    [89, 42, 5],
    [89, 49, 5],
    [87, 56, 5],
    [85, 62, 5],
    [83, 67, 6],
    [81, 71, 10],
    [80, 75, 16],
    [80, 79, 18],
    [80, 83, 16],
    [78, 87, 9],
    [74, 92, 7],
    [69, 98, 8],
    [63, 104, 9],
    [57, 110, 9],
    [52, 116, 8],
    [47, 122, 7],
    [44, 128, 7],
    [39, 134, 7],
    [33, 140, 7],
    [28, 146, 7],
    [25, 152, 7],
  ],
  samara: [
    [186, 10, 2],
    [170, 12, 2],
    [158, 15, 2],
    [146, 14, 2],
    [136, 17, 2],
    [126, 20, 2.5],
    [116, 22, 2.5],
    [106, 23, 3],
    [96, 24, 3],
    [89, 24, 3],
    [83, 23, 3],
  ],
  vovcha: [
    [178, 62, 1.5],
    [168, 52, 1.5],
    [162, 44, 1.5],
    [156, 36, 2],
    [150, 30, 2],
    [143, 25, 2],
    [135, 21, 2],
    [127, 20, 2],
  ],
  konka: [
    [188, 82, 2],
    [174, 85, 2],
    [162, 88, 2],
    [150, 92, 2],
    [136, 95, 2.5],
    [122, 96, 2.5],
    [110, 98, 2.5],
    [101, 104, 2.5],
    [92, 112, 2.5],
    [82, 119, 2.5],
    [72, 125, 2.5],
    [62, 129, 2.5],
    [54, 130, 2.5],
    [48, 127, 2.5],
  ],
  bazavluk: [
    [2, 50, 1.5],
    [14, 58, 1.5],
    [22, 66, 1.5],
    [30, 74, 1.5],
    [38, 83, 2],
    [46, 92, 2],
    [53, 99, 2],
    [59, 103, 2],
    [64, 104, 2],
  ],
};

/** The nine rapids (Kodak … Vilnyi), rows across the Dnipro; Nenasytets, the greatest, takes two. */
export const RAPIDS: readonly (readonly number[])[] = [[29], [33], [36], [39], [44, 45], [50], [55], [59], [63]];
/** Khortytsia: the island in the Dnipro (centre, half-axes), the Sich's mark on its north end. */
export const KHORTYTSIA = { cx: 79.5, cy: 79, rx: 4.2, ry: 8.6 } as const;
/** Kurgans of the steppe (the mound's centre px). */
export const KURGANS: readonly (readonly [number, number])[] = [
  [28, 48],
  [46, 60],
  [14, 84],
  [34, 104],
  [136, 52],
  [152, 64],
  [168, 72],
  [140, 76],
  [108, 78],
  [112, 120],
  [128, 130],
  [164, 124],
  [158, 140],
  [72, 138],
  [18, 130],
];
/** The chumak road down the right bank to the Tavan ford and on (dotted). */
export const ROAD: readonly (readonly [number, number])[] = [
  [6, 70],
  [12, 82],
  [19, 95],
  [27, 107],
  [35, 117],
  [42, 125],
  [50, 132],
  [57, 138],
  [63, 145],
];
const COMPASS = { cx: 22, cy: 27 } as const;
/** Pine groves (бори) on the Samara. */
const PINES: readonly (readonly [number, number])[] = [
  [112, 13],
  [117, 10],
  [121, 15],
  [126, 11],
  [131, 14],
  [136, 10],
  [141, 9],
  [106, 30],
  [113, 31],
];

interface Near {
  /** Distance from the px centre to the centreline minus half the local width: ≤ 0 = water. */
  readonly m: number;
  /** Offset from the nearest centreline point to the px (bank orientation). */
  readonly dx: number;
  readonly dy: number;
}

/** Nearest approach of (px, py) to a river's centreline, its width interpolated along each segment. */
export function nearRiver(pts: readonly RiverPt[], px: number, py: number): Near {
  let best: Near = { m: Infinity, dx: 0, dy: 0 };
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    if (!a || !b) continue;
    const ex = b[0] - a[0];
    const ey = b[1] - a[1];
    const len2 = ex * ex + ey * ey;
    const t = len2 === 0 ? 0 : Math.min(1, Math.max(0, ((px - a[0]) * ex + (py - a[1]) * ey) / len2));
    const cx = a[0] + ex * t;
    const cy = a[1] + ey * t;
    const dx = px - cx;
    const dy = py - cy;
    const m = Math.sqrt(dx * dx + dy * dy) - (a[2] + (b[2] - a[2]) * t) / 2;
    if (m < best.m) best = { m, dx, dy };
  }
  return best;
}

/** The river's centre column at row y (first segment that spans it). */
export function riverX(pts: readonly RiverPt[], y: number): number {
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    if (!a || !b || y < a[1] || y > b[1] || a[1] === b[1]) continue;
    return a[0] + ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]);
  }
  return NaN;
}

const inKhortytsia = (x: number, y: number): boolean => {
  const u = (x + 0.5 - KHORTYTSIA.cx) / KHORTYTSIA.rx;
  const v = (y + 0.5 - KHORTYTSIA.cy) / KHORTYTSIA.ry;
  return u * u + v * v <= 1;
};

const SEED = {
  paper: seedOf('raid-map:paper'),
  edge: seedOf('raid-map:edge'),
  spots: seedOf('raid-map:spots'),
  channels: seedOf('raid-map:channels'),
  lakes: seedOf('raid-map:lakes'),
  grove: seedOf('raid-map:grove'),
  wash: seedOf('raid-map:wash'),
};

const LUH_SLACK = 1.5;
/** The Velykyi Luh: between the Dnipro below Khortytsia and the Konka, down to their meeting above Tavan. */
function inLuh(x: number, y: number): boolean {
  if (y < 86 || y > 131 || x > 104) return false;
  const px = x + 0.5;
  const py = y + 0.5;
  const dnipro = RIVERS.dnipro.slice(15, 23);
  const konka = RIVERS.konka.slice(6);
  const d = nearRiver(dnipro, px, py);
  const k = nearRiver(konka, px, py);
  if (d.m <= 1 || k.m <= 1) return false;
  // Between two curves the distances to them add up to the gap; outside, one of them is counted twice.
  const gap = nearRiver(konka, px - d.dx, py - d.dy).m;
  return d.m + k.m <= gap + LUH_SLACK;
}

/** One px of the map: ramp + whole shade (the map dithers by hand, never by fractional shades). */
const put = (p: Plot, x: number, y: number, ramp: RampName, shade: number): void => {
  if (x >= 0 && y >= 0 && x < W && y < H) p.set(x, y, ramp, shade);
};

function paper(p: Plot): void {
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      // Low mottling: thatch 6 with thatch 5 clouds, stepped by a 2×2 checker where they meet.
      const n = q8(fbm(x, y, 22, 3, SEED.paper));
      const checker = (x + y) % 2 === 0;
      let shade = n > 0.66 || (n > 0.6 && checker) ? 5 : 6;
      // Age toward the edge: a ragged band of thatch 5, then thatch 4 and a burnt wood rim.
      const e = Math.min(x, y, W - 1 - x, H - 1 - y) + q8(valueNoise(x, y, 5, 5, SEED.edge)) * 3;
      let ramp: RampName = 'thatch';
      if (e < 1.6) {
        ramp = 'wood';
        shade = e < 0.9 ? 3 : 4;
      } else if (e < 3.2) shade = 4;
      else if (e < 9 && (shade === 5 || checker || e < 6)) shade = 5;
      put(p, x, y, ramp, shade);
    }
  }
  // Foxing: a few brown spots.
  for (let i = 0; i < 14; i++) {
    const x = 8 + Math.floor(rand2(i, 1, SEED.spots) * (W - 16));
    const y = 8 + Math.floor(rand2(i, 2, SEED.spots) * (H - 16));
    put(p, x, y, 'thatch', 4);
    if (rand2(i, 3, SEED.spots) < 0.5) put(p, x + 1, y, 'thatch', 5);
  }
}

function luh(p: Plot): void {
  // Flow-aligned frame: channels run with the Dnipro (south-west) and braid across.
  const fx = -0.62;
  const fy = 0.78;
  for (let y = 80; y < 132; y++) {
    for (let x = 30; x < 108; x++) {
      if (!inLuh(x, y)) continue;
      const u = x * fx + y * fy;
      const v = x * fy - y * fx;
      const wet = q8(valueNoise(x, y, 9, 9, SEED.wash));
      put(p, x, y, 'grass', wet > 0.6 && (x + y) % 2 === 0 ? 6 : 7);
      const c = q8(valueNoise(u, v, 18, 5, SEED.channels));
      const lake = q8(valueNoise(x, y, 6, 6, SEED.lakes));
      if (Math.abs(c - 0.5) < 0.04 || lake > 0.9) put(p, x, y, 'water', 4);
    }
  }
  // Oak groves on the dry ground of the Luh: a tree every ~4 px where the grove noise is high.
  for (let gy = 80; gy < 132; gy += 3) {
    for (let gx = 30; gx < 108; gx += 3) {
      const ox = gx + Math.floor(rand2(gx, gy, SEED.grove) * 3);
      const oy = gy + Math.floor(rand2(gy, gx, SEED.grove) * 3);
      if (q8(valueNoise(ox, oy, 8, 8, SEED.grove)) < 0.38) continue;
      if (![0, 1, 2].every((dy) => [0, 1, 2].every((dx) => dry(p, ox + dx, oy + dy)))) continue;
      tree(p, ox, oy);
    }
  }
}

/** A px of the Luh's (or the island's) wash: green, not water — room for a tree. */
const dry = (p: Plot, x: number, y: number): boolean => {
  const px = p.get(x, y);
  return px?.ramp === 'grass' && px.shade >= 6;
};

/** An oak, 3×3: a lit crown and its shaded side, the trunk under it. */
function tree(p: Plot, x: number, y: number): void {
  put(p, x + 1, y, 'grass', 4);
  put(p, x, y + 1, 'grass', 4);
  put(p, x + 1, y + 1, 'grass', 3);
  put(p, x + 2, y + 1, 'grass', 2);
  put(p, x + 1, y + 2, 'earth', 2);
}

/** A pine, 3×4: a narrow crown and a trunk. */
function pine(p: Plot, x: number, y: number): void {
  put(p, x + 1, y, 'grass', 3);
  put(p, x, y + 1, 'grass', 4);
  put(p, x + 1, y + 1, 'grass', 3);
  put(p, x + 2, y + 1, 'grass', 2);
  put(p, x, y + 2, 'grass', 3);
  put(p, x + 1, y + 2, 'grass', 2);
  put(p, x + 2, y + 2, 'grass', 2);
  put(p, x + 1, y + 3, 'earth', 2);
}

/** A kurgan, 5×3: a mound lit from the left on a ground line. */
function kurgan(p: Plot, cx: number, cy: number): void {
  put(p, cx - 1, cy - 1, 'earth', 5);
  put(p, cx, cy - 1, 'earth', 4);
  put(p, cx + 1, cy - 1, 'earth', 3);
  put(p, cx - 2, cy, 'earth', 5);
  put(p, cx - 1, cy, 'earth', 4);
  put(p, cx, cy, 'earth', 4);
  put(p, cx + 1, cy, 'earth', 3);
  put(p, cx + 2, cy, 'earth', 2);
  for (let dx = -3; dx <= 3; dx++) put(p, cx + dx, cy + 1, 'earth', dx >= 2 || dx <= -3 ? 3 : 2);
}

interface RiverLook {
  /** Water near the bank and in the middle. */
  readonly edge: number;
  readonly body: number;
  /** Bank ink: sun side (up-left), shade side (down-right). */
  readonly bank: readonly [RampName, number, RampName, number];
}

const MAIN: RiverLook = { edge: 3, body: 4, bank: ['earth', 2, 'earth', 1] };
const STREAM: RiverLook = { edge: 3, body: 4, bank: ['earth', 3, 'earth', 2] };

function river(p: Plot, pts: readonly RiverPt[], look: RiverLook, x0: number, x1: number, y0: number, y1: number) {
  for (let y = Math.max(0, y0); y < Math.min(H, y1); y++) {
    for (let x = Math.max(0, x0); x < Math.min(W, x1); x++) {
      if (inKhortytsia(x, y) && pts === RIVERS.dnipro) continue;
      const n = nearRiver(pts, x + 0.5, y + 0.5);
      if (n.m <= 0) {
        // Darker at the banks; on the broad lower Dnipro a lighter streak dashed down the middle.
        // Above the Luh only sparse 1–2 px glints (one every ~8–10 px along the current, art-director M3-10).
        const glint = n.m < -1 && (x + y * 3) % 9 === 0 && rand2(x, y, SEED.wash) < 0.7;
        const streak = n.m < -2 && q8(valueNoise(x, y * 0.5, 3, 5, SEED.wash)) > 0.62 && (y > 86 || glint);
        put(p, x, y, 'water', streak ? 5 : n.m > -1 ? look.edge : look.body);
      } else if (n.m <= 1 && p.get(x, y)?.ramp !== 'water') {
        const shade = n.dx + n.dy > 0;
        put(p, x, y, shade ? look.bank[2] : look.bank[0], shade ? look.bank[3] : look.bank[1]);
      }
    }
  }
}

function rapids(p: Plot): void {
  for (const rows of RAPIDS) {
    for (const y of rows) {
      const cx = riverX(RIVERS.dnipro, y + 0.5);
      for (let x = Math.floor(cx) - 4; x <= Math.ceil(cx) + 4; x++) {
        if (p.get(x, y)?.ramp !== 'water') continue;
        // Stone and foam alternate across the stream; the row under the ridge breaks white.
        put(p, x, y, (x + y) % 2 === 0 ? 'earth' : 'water', (x + y) % 2 === 0 ? 2 : 7);
        if (p.get(x, y + 1)?.ramp === 'water' && (x + y) % 2 === 1) put(p, x, y + 1, 'water', 6);
      }
    }
  }
  // Granite banks along the rapids: short hachures off both banks.
  for (let y = 27; y <= 66; y += 2) {
    const cx = riverX(RIVERS.dnipro, y + 0.5);
    for (const side of [-1, 1]) {
      let x = Math.round(cx);
      while (p.get(x, y)?.ramp === 'water' || p.get(x, y)?.ramp === 'earth') x += side;
      if (Math.abs(x - cx) > 6) continue;
      put(p, x, y, 'earth', 3);
      if ((y / 2) % 2 === 0) put(p, x + side, y, 'earth', 3);
    }
  }
}

function khortytsia(p: Plot): void {
  for (let y = 68; y < 92; y++) {
    for (let x = 70; x < 90; x++) {
      if (!inKhortytsia(x, y)) continue;
      const rim = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ].some(([dx = 0, dy = 0]) => !inKhortytsia(x + dx, y + dy));
      const shadeSide = !inKhortytsia(x + 1, y) || !inKhortytsia(x, y + 1);
      if (rim) put(p, x, y, 'earth', shadeSide ? 1 : 2);
      else put(p, x, y, 'grass', (x + y) % 2 === 0 ? 6 : 7);
    }
  }
  // Oaks on the island's south half; the Sich's mark on its north half: a church dome (lit top-left) over a palisade.
  tree(p, 77, 81);
  tree(p, 80, 83);
  tree(p, 78, 85);
  const sx = 77;
  const sy = 73;
  for (const [dx, dy, ramp, shade] of [
    [2, 0, 'earth', 1],
    [1, 1, 'thatch', 4],
    [2, 1, 'earth', 2],
    [3, 1, 'earth', 1],
    [1, 2, 'earth', 2],
    [2, 2, 'earth', 2],
    [3, 2, 'earth', 1],
    [0, 3, 'earth', 1],
    [2, 3, 'earth', 1],
    [4, 3, 'earth', 1],
    [0, 4, 'earth', 1],
    [1, 4, 'earth', 1],
    [2, 4, 'earth', 1],
    [3, 4, 'earth', 1],
    [4, 4, 'earth', 1],
  ] as const)
    put(p, sx + dx, sy + dy, ramp, shade);
}

function dotted(p: Plot, pts: readonly (readonly [number, number])[], every: number): void {
  let step = 0;
  let last = '';
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    if (!a || !b) continue;
    const n = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]));
    for (let k = 0; k < n; k++) {
      const x = Math.round(a[0] + ((b[0] - a[0]) * k) / n);
      const y = Math.round(a[1] + ((b[1] - a[1]) * k) / n);
      const key = `${String(x)},${String(y)}`;
      if (key === last) continue;
      last = key;
      if (step++ % every !== 0) continue;
      const under = p.get(x, y)?.ramp;
      if (under === 'thatch') put(p, x, y, 'earth', 3);
    }
  }
}

/** Point-in-triangle by edge signs (px centres). */
function inTri(px: number, py: number, a: readonly number[], b: readonly number[], c: readonly number[]): boolean {
  const s = (p: readonly number[], q: readonly number[]): number =>
    ((q[0] ?? 0) - (p[0] ?? 0)) * (py - (p[1] ?? 0)) - ((q[1] ?? 0) - (p[1] ?? 0)) * (px - (p[0] ?? 0));
  const d1 = s(a, b);
  const d2 = s(b, c);
  const d3 = s(c, a);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
}

/**
 * The compass rose: four long rays (north the longest, its tip crimson, a dot over it) and four short diagonals, each split
 * along its axis into a light and a dark half, over a thin ring; an ink outline around the star.
 */
function compass(p: Plot): void {
  const { cx, cy } = COMPASS;
  const star = new Plot();
  // [dirX, dirY, length, half width at the centre]
  const rays: readonly (readonly [number, number, number, number])[] = [
    [0, -1, 13, 2.5],
    [1, 0, 8, 2.5],
    [0, 1, 8, 2.5],
    [-1, 0, 8, 2.5],
    [0.7071, -0.7071, 5.5, 1.6],
    [0.7071, 0.7071, 5.5, 1.6],
    [-0.7071, 0.7071, 5.5, 1.6],
    [-0.7071, -0.7071, 5.5, 1.6],
  ];
  const ox = cx + 0.5;
  const oy = cy + 0.5;
  for (let y = cy - 15; y <= cy + 10; y++) {
    for (let x = cx - 10; x <= cx + 10; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      for (const [dx, dy, len, hw] of rays) {
        const tip = [ox + dx * len, oy + dy * len];
        const l = [ox - dy * hw, oy + dx * hw];
        const r = [ox + dy * hw, oy - dx * hw];
        if (!inTri(px, py, tip, l, r)) continue;
        // The half clockwise of the axis is dark (the rose is lit from the top-left like the sprites).
        const side = dx * (py - oy) - dy * (px - ox);
        star.set(x, y, 'earth', side > 0 ? 2 : 5);
        break;
      }
    }
  }
  // Ring under the star.
  for (let y = cy - 6; y <= cy + 6; y++) {
    for (let x = cx - 6; x <= cx + 6; x++) {
      const dx = x + 0.5 - ox;
      const dy = y + 0.5 - oy;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d >= 4.6 && d < 5.6 && !star.has(x, y)) put(p, x, y, 'earth', 3);
    }
  }
  for (const [k, v] of star.px) {
    const x = k % 4096;
    const y = Math.floor(k / 4096);
    put(p, x, y, v.ramp, v.shade);
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const)
      if (!star.has(x + dx, y + dy) && p.get(x + dx, y + dy)?.ramp !== 'earth') put(p, x + dx, y + dy, 'earth', 1);
  }
  // North: the longest ray, its tip crimson, a dot over it.
  put(p, cx, cy - 13, 'crimson', 3);
  put(p, cx, cy - 15, 'earth', 1);
}

/** The double rule and a rhombus in each corner box (the vyshyvka motif of the UI frames, ART-BIBLE §9). */
function frame(p: Plot): void {
  const { outer, inner } = MAP_FRAME;
  for (let x = outer; x < W - outer; x++) {
    put(p, x, outer, 'earth', 1);
    put(p, x, H - 1 - outer, 'earth', 1);
  }
  for (let y = outer; y < H - outer; y++) {
    put(p, outer, y, 'earth', 1);
    put(p, W - 1 - outer, y, 'earth', 1);
  }
  for (let x = inner; x < W - inner; x++) {
    put(p, x, inner, 'earth', 3);
    put(p, x, H - 1 - inner, 'earth', 3);
  }
  for (let y = inner; y < H - inner; y++) {
    put(p, inner, y, 'earth', 3);
    put(p, W - 1 - inner, y, 'earth', 3);
  }
  // Paper between the rules (the band inside the outer rule is clean).
  for (let x = outer + 1; x < W - outer - 1; x++) {
    put(p, x, outer + 1, 'thatch', 5);
    put(p, x, H - 2 - outer, 'thatch', 5);
  }
  for (let y = outer + 1; y < H - outer - 1; y++) {
    put(p, outer + 1, y, 'thatch', 5);
    put(p, W - 2 - outer, y, 'thatch', 5);
  }
  for (const [bx, by] of [
    [1, 1],
    [W - 8, 1],
    [1, H - 8],
    [W - 8, H - 8],
  ] as const) {
    for (let dy = 0; dy < 7; dy++) {
      for (let dx = 0; dx < 7; dx++) {
        const edge = dx === 0 || dy === 0 || dx === 6 || dy === 6;
        const r = Math.abs(dx - 3) + Math.abs(dy - 3);
        put(
          p,
          bx + dx,
          by + dy,
          edge ? 'earth' : r <= 1 ? 'earth' : r === 2 ? 'thatch' : 'thatch',
          edge ? 1 : r <= 1 ? 2 : r === 2 ? 4 : 6,
        );
      }
    }
  }
}

/** Draws the whole map into a Plot (also used by tests and the mock). */
export function drawRaidMap(): Plot {
  const p = new Plot();
  paper(p);
  const base = new Plot();
  for (const [k, v] of p.px) base.px.set(k, v);
  luh(p);
  for (const [x, y] of KURGANS) kurgan(p, x, y);
  for (const [x, y] of PINES) pine(p, x, y);
  dotted(p, ROAD, 3);
  river(p, RIVERS.bazavluk, STREAM, 0, 70, 44, 110);
  river(p, RIVERS.vovcha, STREAM, 120, W, 14, 66);
  river(p, RIVERS.samara, STREAM, 80, W, 4, 30);
  river(p, RIVERS.konka, STREAM, 40, W, 76, 132);
  river(p, RIVERS.dnipro, MAIN, 0, 100, 0, H);
  rapids(p);
  khortytsia(p);
  compass(p);
  // Nothing crosses the inner rule: the band outside it is bare (aged) paper again.
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (Math.min(x, y, W - 1 - x, H - 1 - y) > MAP_FRAME.inner) continue;
      const v = base.get(x, y);
      if (v) p.set(x, y, v.ramp, v.shade);
    }
  frame(p);
  return p;
}

const raidMap: SpriteGenerator = {
  atlas: 'map',
  id: 'raid-map',
  size: { w: W, h: H },
  frames: { idle: 1 },
  variants: ['khortytsia'],
  anchor: { x: 0, y: 0 },
  generate(_rng, { buffer }) {
    for (const [k, v] of drawRaidMap().px) buffer.set(k % 4096, Math.floor(k / 4096), { ramp: v.ramp, shade: v.shade });
  },
};

export default raidMap;
