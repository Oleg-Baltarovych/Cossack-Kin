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

/** Пісні на майдані: the Sich's литаври (a copper kettle drum the довбиш beat to call the rada), two sticks on it. */
function maidan(i: Icon): void {
  paint(
    i,
    [
      '................',
      '..kk........kk..',
      '..kc........ck..',
      '....W......W....',
      '.....W....W.....',
      '......W..W......',
      '...uTTTTttttu...',
      '..uttttttttttu..',
      '..444444433333..',
      '..334333332221..',
      '...3433322221...',
      '...3433222221...',
      '....33222211....',
      '.....222111.....',
      '......1111......',
      '................',
    ],
    {
      k: ['wood', 5],
      c: ['wood', 3],
      W: ['wood', 4],
      T: ['thatch', 6],
      t: ['thatch', 5],
      u: ['thatch', 4],
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

/** Бандура в курені: the many-stringed bandura — a wide round body, a short neck off its bass side, strings on it. */
function bandura(i: Icon): void {
  paint(
    i,
    [
      '................',
      '...gaaa.........',
      '....aaag........',
      '....bsa.........',
      '....bsa.........',
      '....bbbbbba.....',
      '...bTlTlTlTla...',
      '..bTTlTlTltlta..',
      '..bTTlTlTltlta..',
      '..bTTlTltltlta..',
      '..bTtltltltlta..',
      '..btTltltltlta..',
      '...baaaaaaaaa...',
      '....btttttta....',
      '......aaaa......',
      '................',
    ],
    {
      a: ['wood', 1],
      b: ['wood', 2],
      l: ['wood', 2],
      s: ['thatch', 6],
      T: ['thatch', 5],
      t: ['thatch', 4],
      g: ['gold', 3],
    },
  );
}

/** Лірники на шляху: the колісна ліра (hurdy-gurdy) — a waisted body, the key box along it, the crank at its tail. */
function lirnyky(i: Icon): void {
  paint(
    i,
    [
      '................',
      '................',
      '................',
      '................',
      '...bccb...bccb..',
      '..bdddcb.bddcca.',
      '.bddddcccdddcca.',
      '.bddaaaaaaaaca..',
      '.cdda.k.k.k.aS..',
      '.cddaaaaaaaacas.',
      '.bccccccccccca.n',
      '..bccca..bcca..n',
      '...aaa....aaa...',
      '................',
      '................',
      '................',
    ],
    {
      a: ['wood', 1],
      b: ['wood', 3],
      c: ['wood', 4],
      d: ['wood', 5],
      k: ['thatch', 6],
      S: ['stone', 5],
      s: ['stone', 3],
      n: ['wood', 5],
    },
  );
}

/** Велика дума: the kobza in a gold sun of rays — the crowning node of the music branch. */
function great(i: Icon): void {
  for (let y = 0; y < ICON_SIZE; y++) {
    for (let x = 0; x < ICON_SIZE; x++) {
      const dx = x - 7.5;
      const dy = y - 7.5;
      const d2 = dx * dx + dy * dy;
      // Eight rays (on the axes and the diagonals) out to the edge; a disc between them.
      const ray = (Math.abs(dx) < 1 || Math.abs(dy) < 1 || Math.abs(Math.abs(dx) - Math.abs(dy)) < 1) && d2 <= 50;
      if (d2 <= 30 || ray) i.set(x, y, 'gold', dx + dy < -2 ? 4 : dx + dy > 2 ? 2 : 3, { flat: true });
    }
  }
  paint(i, KOBZA, KOBZA_LEGEND);
}

/**
 * Вечорниці: a clay каганець (oil lamp) burning, as the young spun by it on winter evenings, and a spindle (веретено)
 * wound with flax thread beside it.
 */
function vechornytsi(i: Icon): void {
  paint(
    i,
    [
      '................',
      '....o.......n...',
      '...oY.......n...',
      '...YZo......n...',
      '..oZZY......T...',
      '..YZZYo....tTu..',
      '...YYo.....tTu..',
      '....n......tTu..',
      '.EEEEEEEEe..T...',
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
      n: ['wood', 2],
      m: ['wood', 4],
      T: ['wood', 5],
      t: ['wood', 6],
      u: ['wood', 4],
      E: ['earth', 5],
      e: ['earth', 4],
      f: ['earth', 3],
      g: ['earth', 2],
    },
  );
}

/** Толока: the community's work — a wooden pitchfork (вила) crossed with an axe. */
function toloka(i: Icon): void {
  paint(
    i,
    [
      '................',
      '................',
      '..SS.......W....',
      '.SSs......W.W...',
      '.Sss.c...W.W.W..',
      '..ss.c.W.W.W....',
      '.....c.W.W......',
      '......cW........',
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

/** Гостина: bread and salt (хліб-сіль) — a round коровай with a salt cellar on it, on an embroidered рушник. */
function hostyna(i: Icon): void {
  paint(
    i,
    [
      '................',
      '................',
      '......PPPp......',
      '......pqqq......',
      '....eeffffd.....',
      '...efffffeddd...',
      '..effcfcfcfdc...',
      '..efffffffddc...',
      '..dffddddddcc...',
      '.PPPPPPPPPPPPq..',
      '.PppppppppppqqC.',
      '.Pp.........qC..',
      '.rR.........rR..',
      '.Rr.........Rr..',
      '.P.P.......P.P..',
      '................',
    ],
    {
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

/** Купальська ніч: the fern flower (цвіт папороті) of the Kupala legend, glowing on its frond. */
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
      '..GG...gG.GG....',
      '...GG..g.GG.....',
      '.GG.GG.gGG.GG...',
      '..GG..GgG..G....',
      '....GG.g.GG.....',
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
      g: ['grass', 3],
      h: ['grass', 2],
    },
  );
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

/** Музика (branch): a сопілка (folk flute) on the slant, its finger holes on top, a crimson ribbon at its foot. */
function music(i: Icon): void {
  for (let x = 2; x <= 13; x++) {
    i.set(x, 15 - x, 'wood', 5, { flat: true });
    i.set(x, 16 - x, 'wood', 3, { flat: true });
  }
  // The fipple block at the mouth (upper right), the finger holes, the open foot.
  i.set(13, 2, 'wood', 2, { flat: true });
  i.set(13, 3, 'wood', 1, { flat: true });
  i.set(12, 3, 'ink', 2, { flat: true });
  for (const x of [6, 8, 10]) i.set(x, 15 - x, 'ink', 2, { flat: true });
  i.set(2, 14, 'wood', 1, { flat: true });
  // The ribbon tied round the tube, its two tails hanging.
  for (const [x, y, s] of [
    [4, 11, 4],
    [4, 12, 3],
    [5, 11, 3],
    [5, 12, 3],
    [6, 12, 4],
    [6, 13, 3],
    [7, 14, 2],
    [3, 13, 3],
    [3, 14, 2],
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
