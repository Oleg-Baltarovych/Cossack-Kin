// The culture icons 16×16 (plan M4-10): the 12 nodes and 2 branches of the culture tree (src/content/culture.ts).
// Drawn like the UI icons (`../../ui/icon`: the same outline, top-left light, ≤ 16 colours / 4 ramps) but packed in a
// DOM-only `culture` atlas of their own: growing `ui` changed how Chrome rasterised the HUD's icons (loot, M3-12), and
// Pixi loads only the world atlases. Each icon is a pixel grid, every px shaded by hand (flat); `Icon.finish` adds the
// ink outline around it. Frame ids: a node's id with `-` for `.` (frame-name segments allow no dot), a branch's id.
import type { RampName } from '../../lib/buffer.ts';
import type { SpriteGenerator } from '../../lib/types.ts';
import { Icon, ICON_FRAME, ICON_MARGIN, ICON_SIZE } from '../../ui/icon/index.ts';

export const CULTURE_ICONS = [
  'music-dumy',
  'music-maidan',
  'music-campaign',
  'music-bandura',
  'music-lirnyky',
  'music-great',
  'customs-vechornytsi',
  'customs-toloka',
  'customs-hostyna',
  'customs-obzhynky',
  'customs-kupala',
  'customs-didukh',
  'music',
  'customs',
] as const;
export type CultureIconId = (typeof CULTURE_ICONS)[number];

type Legend = Readonly<Record<string, readonly [RampName, number]>>;

/** Paints a 16-row grid of 16 chars ('.' = empty) through `legend`, every px flat (hand-shaded). */
function paint(i: Icon, grid: readonly string[], legend: Legend): void {
  if (grid.length !== ICON_SIZE) throw new Error(`culture icon: ${String(grid.length)} rows`);
  grid.forEach((row, y) => {
    if (row.length !== ICON_SIZE) throw new Error(`culture icon: row ${String(y)} is ${String(row.length)} px`);
    for (let x = 0; x < ICON_SIZE; x++) {
      const c = row.charAt(x);
      if (c === '.') continue;
      const px = legend[c];
      if (!px) throw new Error(`culture icon: no legend for '${c}'`);
      i.set(x, y, px[0], px[1], { flat: true });
    }
  });
}

/**
 * The kobza upright (a front view): a dark pegbox with brass pegs, a short neck carrying the one pale string, a
 * pear-shaped bowl with a pale soundboard in a dark rim (lit upper left), the sound hole and the bridge.
 */
const KOBZA = [
  '................',
  '.....gaaa.......',
  '......aaag......',
  '.....gaaa.......',
  '......csa.......',
  '......csa.......',
  '......csa.......',
  '.....becda......',
  '....beecdda.....',
  '...beeehhdda....',
  '...beedhhdda....',
  '...beddcddda....',
  '...bddaaadda....',
  '....bddddda.....',
  '.....aaaaa......',
  '................',
] as const;
const KOBZA_LEGEND: Legend = {
  a: ['wood', 1],
  b: ['wood', 2],
  c: ['wood', 3],
  d: ['wood', 4],
  e: ['wood', 5],
  s: ['thatch', 6],
  g: ['gold', 3],
  h: ['ink', 2],
};

/** Кобзарські думи: the kobza a duma was chanted to. */
function dumy(i: Icon): void {
  paint(i, KOBZA, KOBZA_LEGEND);
}

/**
 * Пісні на майдані: the Sich's литаври (the copper kettle drum the довбиш beat to call the rada) — a round bowl on a
 * flat foot, a cord band with three rivets under an ink rim, a pale drumhead; two sticks with knob heads rest on it.
 */
function maidan(i: Icon): void {
  paint(
    i,
    [
      '................',
      '..kk........kk..',
      '..kK........Kk..',
      '....W......W....',
      '.....W....W.....',
      '....PPPPpppq....',
      '...PPPpppppqq...',
      '...iiiiiiiiii...',
      '..bbobbobbbobb..',
      '..343333332221..',
      '..343333322221..',
      '...3433322221...',
      '....33322211....',
      '.....222111.....',
      '......111.......',
      '................',
    ],
    {
      k: ['wood', 5],
      K: ['wood', 3],
      W: ['wood', 4],
      P: ['plaster', 6],
      p: ['plaster', 5],
      q: ['plaster', 4],
      i: ['ink', 2],
      b: ['gold', 2],
      o: ['gold', 5],
      '1': ['gold', 1],
      '2': ['gold', 2],
      '3': ['gold', 3],
      '4': ['gold', 4],
    },
  );
}

/** Думи про походи: a чайка under its square sail on the waves of the sea (the dumas of sea campaigns). */
function campaign(i: Icon): void {
  paint(
    i,
    [
      '................',
      '.......b........',
      '...bbbbbbbbb....',
      '....PPPPpppq....',
      '....PPPPpppq....',
      '....PPPppppq....',
      '....PPppppqq....',
      '....Pppppqqq....',
      '.....ppbqqr.....',
      '.c.....b.....c..',
      '.cdddddddddddc..',
      '..bbbbbbbbbbaa..',
      '...aaaaaaaaaa...',
      '..VVw...VVw..Vw.',
      '.wwwwwwwwwwwwww.',
      '................',
    ],
    {
      a: ['wood', 1],
      b: ['wood', 2],
      c: ['wood', 3],
      d: ['wood', 4],
      P: ['plaster', 6],
      p: ['plaster', 5],
      q: ['plaster', 4],
      r: ['plaster', 3],
      V: ['water', 6],
      w: ['water', 4],
    },
  );
}

/**
 * Бандура в курені: the bandura — an asymmetric body (the bass side round, the treble shoulder flat and wide), a short
 * neck in its upper left with a curled head, four pale strings fanning to a low bridge, and the приструнки (short
 * treble strings) as pale dots along the right shoulder: what tells it from a kobza.
 */
function bandura(i: Icon): void {
  const rows: readonly (readonly [number, number, number])[] = [
    [4, 6, 12],
    [5, 3, 13],
    [6, 2, 13],
    [7, 1, 13],
    [8, 1, 13],
    [9, 1, 13],
    [10, 1, 12],
    [11, 1, 12],
    [12, 2, 11],
    [13, 3, 10],
    [14, 5, 8],
  ];
  const inBody = (x: number, y: number): boolean => rows.some(([ry, x0, x1]) => ry === y && x >= x0 && x <= x1);
  for (const [y, x0, x1] of rows)
    for (let x = x0; x <= x1; x++) {
      const lit = x + y < 14;
      const rim = !inBody(x - 1, y) || !inBody(x + 1, y) || !inBody(x, y - 1) || !inBody(x, y + 1);
      i.set(x, y, 'wood', rim ? (lit ? 2 : 1) : lit ? 4 : 3, { flat: true });
    }
  // The neck merged into the upper left (lit edge, string, shadow edge) and its curled head.
  for (let y = 2; y <= 4; y++) {
    i.set(3, y, 'wood', 3, { flat: true });
    i.set(4, y, 'thatch', 6, { flat: true });
    i.set(5, y, 'wood', 1, { flat: true });
  }
  for (const [x, y] of [
    [2, 1],
    [3, 1],
    [2, 2],
  ] as const)
    i.set(x, y, 'wood', 1, { flat: true });
  // Four strings fanning from the neck to the bridge; the low bridge; the приструнки along the treble shoulder.
  for (const end of [4, 6, 8, 10])
    for (let y = 5; y <= 10; y++) i.set(4 + Math.round(((end - 4) * (y - 5)) / 5), y, 'thatch', 6, { flat: true });
  for (let x = 3; x <= 10; x++) i.set(x, 11, 'wood', 1, { flat: true });
  for (const [x, y] of [
    [9, 5],
    [11, 5],
    [12, 7],
    [12, 9],
  ] as const)
    i.set(x, y, 'thatch', 6, { flat: true });
}

/**
 * Лірники на шляху: the колісна ліра (hurdy-gurdy) — a waisted body, an ink pegbox with a scroll curl on the left, a
 * dark key box with pale keys along it, the wheel cover as a dark arc over the right lobe, the L-shaped crank with a
 * brass knob sticking out past the tail.
 */
function lirnyky(i: Icon): void {
  paint(
    i,
    [
      '................',
      '................',
      '................',
      '................',
      '................',
      '.....dd..aaaa...',
      '....dddc.ccce...',
      '.p..dxxxxxxce...',
      '.pppdxkxkxkcehh.',
      '....cxxxxxxce.h.',
      '....ccceeccee.g.',
      '....ecee.eeea...',
      '.....aa...aa....',
      '................',
      '................',
      '................',
    ],
    {
      a: ['wood', 1],
      c: ['wood', 4],
      d: ['wood', 5],
      e: ['wood', 3],
      x: ['ink', 2],
      k: ['thatch', 6],
      p: ['ink', 3],
      h: ['ink', 3],
      g: ['gold', 4],
    },
  );
}

/** A small kobza (the great duma's): pegbox, neck with its string, bowl with the hole, the bridge. */
const SMALL_KOBZA = [
  '................',
  '................',
  '................',
  '................',
  '.......aag......',
  '.......sa.......',
  '......bsda......',
  '.....besdda.....',
  '.....behhda.....',
  '.....becdda.....',
  '.....baaada.....',
  '......aaaa......',
  '................',
  '................',
  '................',
  '................',
] as const;

/**
 * Велика дума: the crowning node — a small kobza in a ring of eight short radial rays of pale gold, a clear px of the
 * background between the rays and the kobza's outline. The rays are not solid: no outline of their own.
 */
function great(i: Icon): void {
  paint(i, SMALL_KOBZA, KOBZA_LEGEND);
  const rays: readonly (readonly [number, number, number])[] = [
    // On the axes, 2 px wide: the inner px brighter.
    [7, 1, 5],
    [8, 1, 5],
    [7, 0, 4],
    [8, 0, 4],
    [7, 14, 5],
    [8, 14, 5],
    [7, 15, 4],
    [8, 15, 4],
    [2, 7, 5],
    [2, 8, 5],
    [1, 7, 4],
    [1, 8, 4],
    [13, 7, 5],
    [13, 8, 5],
    [14, 7, 4],
    [14, 8, 4],
    // On the diagonals, 1 px wide.
    [3, 3, 5],
    [2, 2, 4],
    [12, 3, 5],
    [13, 2, 4],
    [3, 12, 5],
    [2, 13, 4],
    [12, 12, 5],
    [13, 13, 4],
  ];
  for (const [x, y, s] of rays) i.set(x, y, 'gold', s, { flat: true, solid: false });
}

/**
 * Вечорниці: a clay каганець (oil lamp) burning, as the young spun by it on winter evenings, and a spindle (веретено)
 * wound with yarn under a pale tuft of flax.
 */
function vechornytsi(i: Icon): void {
  paint(
    i,
    [
      '................',
      '....o......wwv..',
      '...oY......wwv..',
      '...YZo.....wvv..',
      '..oZZY.....vvu..',
      '..YZZYo.....n...',
      '...YYo.....TTs..',
      '....k......TTs..',
      '.EEEEEEEEe.TTs..',
      '.fEeeeeeef..m...',
      '..feeeeeg...m...',
      '...ggggg....m...',
      '............m...',
      '............n...',
      '................',
      '................',
    ],
    {
      o: ['gold', 3],
      Y: ['gold', 4],
      Z: ['gold', 5],
      w: ['thatch', 6],
      v: ['thatch', 5],
      u: ['thatch', 4],
      T: ['thatch', 4],
      s: ['thatch', 3],
      m: ['thatch', 3],
      n: ['thatch', 2],
      k: ['earth', 1],
      E: ['earth', 5],
      e: ['earth', 4],
      f: ['earth', 3],
      g: ['earth', 2],
    },
  );
}

/** Толока: the community's work — a wooden pitchfork (вила, three spread tines) crossed with an axe. */
function toloka(i: Icon): void {
  paint(
    i,
    [
      '................',
      '.........W......',
      '..SS....W...W...',
      '.SSs...W...W....',
      '.Sss.c..W.W...W.',
      '..ss.c...W...W..',
      '.....c..W.W.W...',
      '......cW...W....',
      '......Wc........',
      '.....W..c.......',
      '....W....c......',
      '...W......c.....',
      '..W........c....',
      '.W..........c...',
      '................',
      '................',
    ],
    {
      W: ['wood', 4],
      c: ['wood', 2],
      S: ['stone', 5],
      s: ['stone', 3],
    },
  );
}

/**
 * Гостина: bread and salt (хліб-сіль) — a round коровай, wide at its foot, with a pale plaited band round its middle
 * and a white mound of salt in an ink cellar on top, on an embroidered рушник.
 */
function hostyna(i: Icon): void {
  paint(
    i,
    [
      '................',
      '................',
      '......iPPi......',
      '......iiii......',
      '....eeffffdd....',
      '...efffffffdd...',
      '..ececececec....',
      '.efffffffffddc..',
      '.ddddddddddccc..',
      '.PPPPPPPPPPPPpq.',
      '.PppppppppppqqC.',
      '.Pp.........qC..',
      '.rR.........rR..',
      '.Rr.........Rr..',
      '.P.P.......P.P..',
      '................',
    ],
    {
      i: ['ink', 2],
      c: ['wood', 3],
      d: ['wood', 4],
      e: ['wood', 6],
      f: ['wood', 5],
      P: ['plaster', 6],
      p: ['plaster', 5],
      q: ['plaster', 4],
      r: ['crimson', 2],
      R: ['crimson', 4],
      C: ['crimson', 3],
    },
  );
}

/** Обжинки: the harvest wreath woven from the last ears, with blue cornflowers and crimson ribbons. */
function obzhynky(i: Icon): void {
  const cx = 7.5;
  const cy = 7;
  for (let y = 0; y < 13; y++) {
    for (let x = 0; x < ICON_SIZE; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 > 42 || d2 < 9) continue;
      // Lit upper left, shaded lower right; every third px a grain groove a step darker.
      const lit = dx + dy < -3 ? 1 : dx + dy > 3 ? -1 : 0;
      const groove = (x + 2 * y) % 3 === 0 ? -1 : 0;
      i.set(x, y, 'thatch', 4 + lit + groove, { flat: true });
    }
  }
  for (const [x, y] of [
    [3, 3],
    [12, 6],
    [4, 10],
  ] as const) {
    i.set(x, y, 'cloth', 3, { flat: true });
    i.set(x + 1, y, 'cloth', 2, { flat: true });
  }
  // The ribbons from the bottom of the wreath.
  for (const [x, y, s] of [
    [6, 12, 4],
    [6, 13, 3],
    [5, 14, 3],
    [9, 12, 3],
    [9, 13, 2],
    [10, 14, 2],
  ] as const)
    i.set(x, y, 'crimson', s, { flat: true });
}

/**
 * Купальська ніч: the fern flower (цвіт папороті) of the Kupala legend on a pinnate frond (a stem with alternating
 * leaflets); four pale gold glints round the bloom (not solid: no outline).
 */
function kupala(i: Icon): void {
  paint(
    i,
    [
      '................',
      '.......R........',
      '...R..RrR..R....',
      '....RrRYrRr.....',
      '..RrrYZZYrrd....',
      '....rYZZYd......',
      '...Rr.YYrrd.....',
      '...r..ryd..d....',
      '.......g........',
      '.....GGg........',
      '.......gHH......',
      '....GGGg........',
      '.......gHHH.....',
      '...GGGGg........',
      '.......h........',
      '................',
    ],
    {
      R: ['crimson', 5],
      r: ['crimson', 4],
      d: ['crimson', 2],
      Y: ['gold', 4],
      Z: ['gold', 5],
      y: ['gold', 3],
      G: ['grass', 5],
      H: ['grass', 4],
      g: ['grass', 3],
      h: ['grass', 2],
    },
  );
  for (const [x, y] of [
    [1, 1],
    [13, 1],
    [1, 7],
    [13, 7],
  ] as const)
    i.set(x, y, 'gold', 5, { flat: true, solid: false });
}

/** Дідух: the tall Christmas sheaf of the last ears — a fan of ears, crimson ties, the stalks splayed at its foot. */
function didukh(i: Icon): void {
  paint(
    i,
    [
      '................',
      '....T.T..T.T....',
      '..T.tTt.TtTt.T..',
      '..tTTtTTtTTtTt..',
      '...tTtTtTtTtt...',
      '....ttTtTttt....',
      '.....ttsStt.....',
      '.....CCCCcc.....',
      '......sSss......',
      '......sSss......',
      '......sSss......',
      '.....CCCCcc.....',
      '.....sSssss.....',
      '....sSs.s.ss....',
      '...sS..s..s.s...',
      '................',
    ],
    {
      T: ['thatch', 6],
      t: ['thatch', 4],
      S: ['thatch', 5],
      s: ['thatch', 3],
      C: ['crimson', 4],
      c: ['crimson', 2],
    },
  );
}

/**
 * Музика (branch): a сопілка (folk flute) on the slant — a 2-px body under a pale rim (top left), four dark finger
 * holes, the pale window by the mouthpiece, a crimson ribbon tied at its foot with a bent tail.
 */
function music(i: Icon): void {
  for (let x = 3; x <= 13; x++) {
    i.set(x, 14 - x, 'wood', 6, { flat: true });
    i.set(x, 15 - x, 'wood', 4, { flat: true });
    i.set(x, 16 - x, 'wood', 3, { flat: true });
  }
  for (const x of [6, 8, 10, 12]) i.set(x, 15 - x, 'ink', 2, { flat: true });
  // The mouthpiece end and its window; the open foot.
  i.set(13, 2, 'wood', 6, { flat: true });
  i.set(13, 3, 'wood', 2, { flat: true });
  for (let y = 11; y <= 13; y++) i.set(3, y, 'wood', 2, { flat: true });
  // The ribbon tied round the tube, its tail hanging off the low side, then turning.
  for (const [x, y, s] of [
    [5, 9, 4],
    [5, 10, 3],
    [5, 11, 3],
    [6, 12, 3],
    [6, 13, 3],
    [7, 13, 2],
  ] as const)
    i.set(x, y, 'crimson', s, { flat: true });
}

/** Звичаї (branch): a рушник hung on a peg — white linen with a red embroidered rhombus (ромб) round a dot, a stitched band, a fringe. */
function customs(i: Icon): void {
  paint(
    i,
    [
      '................',
      '..cccccccccccb..',
      '...bPPPPPPpqb...',
      '....PPPPPppq....',
      '....PPPRppq.....',
      '....PPRpRpq.....',
      '....PRpdpRq.....',
      '....PPRpRpq.....',
      '....PPPRppq.....',
      '....PPPPppq.....',
      '....RrRrRrR.....',
      '....rRrRrRr.....',
      '....PPPPppq.....',
      '....P.P.p.q.....',
      '................',
      '................',
    ],
    {
      b: ['wood', 1],
      c: ['wood', 3],
      P: ['plaster', 6],
      p: ['plaster', 5],
      q: ['plaster', 4],
      R: ['crimson', 4],
      r: ['crimson', 3],
      d: ['crimson', 2],
    },
  );
}

const DRAW: Readonly<Record<CultureIconId, (i: Icon) => void>> = {
  'music-dumy': dumy,
  'music-maidan': maidan,
  'music-campaign': campaign,
  'music-bandura': bandura,
  'music-lirnyky': lirnyky,
  'music-great': great,
  'customs-vechornytsi': vechornytsi,
  'customs-toloka': toloka,
  'customs-hostyna': hostyna,
  'customs-obzhynky': obzhynky,
  'customs-kupala': kupala,
  'customs-didukh': didukh,
  music,
  customs,
};

const icon: SpriteGenerator = {
  atlas: 'culture',
  // Frames `culture-icon.<id>/idle/00` (src/ui/icons.ts reads that prefix); generator ids are unique (load.ts).
  id: 'culture-icon',
  size: { w: ICON_FRAME, h: ICON_FRAME },
  frames: { idle: 1 },
  variants: CULTURE_ICONS,
  anchor: { x: 0, y: 0 },
  generate(_rng, { variant, buffer, rampSize }) {
    const id = CULTURE_ICONS.find((x) => x === variant);
    if (!id) throw new Error(`culture icon: unknown variant ${String(variant)}`);
    const shape = new Icon();
    DRAW[id](shape);
    for (const [k, p] of shape.finish(rampSize))
      buffer.set(ICON_MARGIN + (k % ICON_SIZE), ICON_MARGIN + Math.floor(k / ICON_SIZE), {
        ramp: p.ramp,
        shade: p.shade,
      });
  },
};

export default icon;
