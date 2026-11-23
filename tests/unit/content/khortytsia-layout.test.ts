import { describe, expect, it } from 'vitest';
import { isVisitorSprite, spawnNodes } from '../../../src/content/agents.ts';
import {
  FOREGROUND_PARALLAX,
  GROUND_TILE,
  KHORTYTSIA_FARM,
  KHORTYTSIA_SICH,
  KHORTYTSIA_SUBURB,
  KHORTYTSIA_WORLD,
  STEPPE_BAND,
  sceneProps,
} from '../../../src/content/villages/khortytsia.layout.ts';

const W = KHORTYTSIA_WORLD;
const SCENES = [
  ['farm', KHORTYTSIA_FARM],
  ['suburb', KHORTYTSIA_SUBURB],
  ['sich', KHORTYTSIA_SICH],
] as const;
const zone = (id: string): { x0: number; x1: number } => {
  const z = W.zones.find((q) => q.id === id);
  if (!z) throw new Error(`no zone ${id}`);
  return z;
};

describe('khortytsia farm layout', () => {
  it('ground rows of every zone start at the horizon, are contiguous and whole 32-px tiles tall', () => {
    for (const scene of [KHORTYTSIA_FARM, KHORTYTSIA_SUBURB, KHORTYTSIA_SICH]) {
      let top = 0;
      for (const row of scene.rows) {
        expect(row.top).toBe(top);
        expect(row.h % GROUND_TILE.h).toBe(0);
        expect(row.h).toBeGreaterThan(0);
        top += row.h;
      }
    }
  });

  it('in every zone, props stand inside the zone and inside its ground rows (or the steppe fill, M2-29 A5)', () => {
    for (const [id, scene] of SCENES) {
      const last = scene.rows.at(-1);
      // The steppe fill runs to the bottom of the view: its plants may stand down to STEPPE_BAND.propsMax.
      const depth = scene.fill === 'steppe' ? STEPPE_BAND.propsMax + 1 : last ? last.top + last.h : 0;
      for (const p of sceneProps(scene.props)) {
        expect(p.x, `${id} ${p.sprite}`).toBeGreaterThanOrEqual(0);
        expect(p.x, `${id} ${p.sprite}`).toBeLessThan(scene.width);
        expect(p.ground).toBeGreaterThan(0);
        expect(p.ground).toBeLessThan(depth);
      }
    }
  });

  it('every khata stands on a yard decal (not on a uniform lawn)', () => {
    const khatas = sceneProps(KHORTYTSIA_FARM.props).filter((p) => p.sprite.startsWith('khata'));
    expect(khatas.length).toBeGreaterThan(0);
    for (const k of khatas) {
      const yard = KHORTYTSIA_FARM.decals.find((d) => Math.abs(d.x - k.x) <= 8 && Math.abs(d.ground - k.ground) <= 8);
      expect(yard, `yard under ${k.sprite} at ${String(k.x)}`).toBeDefined();
    }
  });
});

describe('khortytsia sich layout (ART-11)', () => {
  it('is all Cossacks (no women on the Sich), stays inside the world and has the gate and towers on the rampart', () => {
    const s = KHORTYTSIA_SICH;
    // People on the graph (M2-16): whoever starts or walks to a Sich node past the gate is a Cossack (the gate is open
    // to all: villagers stop there, food carts unload there, M2-20).
    const sichNodes = new Set(s.paths.nodes.filter((n) => n.kind !== 'gate').map((n) => n.id));
    for (const a of W.agents.filter((q) => spawnNodes(q).some((n) => sichNodes.has(n)))) {
      expect(/^(kozak|otaman|vartovyi)\./.test(a.sprite), a.sprite).toBe(true);
    }
    for (const p of sceneProps(s.props)) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(s.width);
    }
    expect(sceneProps(s.props).filter((p) => p.sprite === 'gate')).toHaveLength(1);
    // Towers by tier (M2-09): the watchtower and the wall towers, all standing on the rampart's crest.
    const towers = sceneProps(s.props).filter((p) => /^(tower|watchtower\.|wall-tower\.)/.test(p.sprite));
    expect(towers.length).toBeGreaterThanOrEqual(2);
    for (const t of towers) expect(t.ground, t.sprite).toBeLessThan(40);
    const val = s.rows.find((r) => r.tile === 'val');
    expect(val).toBeDefined();
    for (const p of sceneProps(s.props).filter((q) => q.sprite.startsWith('palisade'))) {
      expect(p.ground).toBeGreaterThanOrEqual(val?.top ?? 0);
      expect(p.ground).toBeLessThan((val?.top ?? 0) + (val?.h ?? 0));
    }
  });

  it('the palisade never repeats one height on more than two neighbouring sections (not a comb)', () => {
    const line = sceneProps(KHORTYTSIA_SICH.props)
      .filter((p) => p.sprite.startsWith('palisade'))
      .map((p) => p.sprite);
    for (let i = 2; i < line.length; i++) {
      expect(line[i] === line[i - 1] && line[i] === line[i - 2]).toBe(false);
    }
  });
});

describe('nothing tall stands in the river band', () => {
  // Rows from the pivot to the top of the sprite: sails reach 36 px above the hub; trees (oak 88×96, willow 80×88).
  const HEIGHT: Readonly<Record<string, number>> = { 'windmill-sails': 36, oak: 92, willow: 80 };

  it('every tall prop over the river (sails, trees) keeps its top below the water rows, in every zone', () => {
    const river = W.river;
    expect(river?.rows).toBeGreaterThan(0);
    const over = W.props.filter((q) => river && q.x >= river.x0 && q.x < river.x1);
    expect(over.filter((q) => q.sprite in HEIGHT).length).toBeGreaterThanOrEqual(3);
    for (const q of over) {
      const top = q.ground - (q.lift ?? 0) - (HEIGHT[q.sprite] ?? 0);
      expect(top, `${q.sprite} at ${String(q.x)}`).toBeGreaterThanOrEqual(river?.rows ?? 0);
    }
  });
});

describe('vegetation (ART-14)', () => {
  it('every sway has a lean share in (0, 1] and a phase in [0, 1)', () => {
    for (const layout of [KHORTYTSIA_FARM, KHORTYTSIA_SICH]) {
      const sways = [
        ...layout.foreground,
        ...sceneProps(layout.props).flatMap((p) => (p.animate?.kind === 'sway' ? [p.animate] : [])),
      ];
      expect(sways.length).toBeGreaterThan(0);
      for (const s of sways) {
        expect(s.amp).toBeGreaterThan(0);
        expect(s.amp).toBeLessThanOrEqual(1);
        expect(s.phase).toBeGreaterThanOrEqual(0);
        expect(s.phase).toBeLessThan(1);
      }
    }
  });

  it('the Sich foreground is grass only (no gardens inside the walls)', () => {
    for (const p of KHORTYTSIA_SICH.foreground) expect(p.sprite).toBe('plant.grass');
  });
});

describe('the continuous world (M2-01)', () => {
  it('zones run edge to edge from 0 to the world width, inner edges on whole ground tiles', () => {
    expect(W.zones.map((z) => z.id)).toEqual(['farm', 'suburb', 'sich']);
    let x = 0;
    for (const z of W.zones) {
      expect(z.x0).toBe(x);
      expect(z.x0 % GROUND_TILE.w).toBe(0);
      expect(z.anchorX).toBeGreaterThanOrEqual(z.x0);
      expect(z.anchorX).toBeLessThan(z.x1);
      x = z.x1;
    }
    expect(x).toBe(W.width);
    // ≈ 4–5 screens of 360–400 px (plan Q2).
    expect(W.width).toBeGreaterThanOrEqual(1600);
    expect(W.width).toBeLessThanOrEqual(2000);
    expect(W.segments.map((s) => [s.x0, s.x1])).toEqual(W.zones.map((z) => [z.x0, z.x1]));
  });

  it('every zone width is whole ground tiles', () => {
    for (const [id, scene] of SCENES) expect(scene.width % GROUND_TILE.w, id).toBe(0);
  });

  it.each(SCENES)(
    '%s: every item is its scene item moved by the zone edge (foreground by its parallax)',
    (id, scene) => {
      const { x0 } = zone(id);
      const fg = Math.round(x0 * FOREGROUND_PARALLAX);
      const inZone = <T extends { readonly x: number }>(items: readonly T[], from: number, to: number): T[] =>
        items.filter((q) => q.x >= from && q.x < to);
      const back = <T extends { readonly x: number }>(items: readonly T[], dx: number): T[] =>
        items.map((q) => ({ ...q, x: q.x - dx }));
      const x1 = x0 + scene.width;
      expect(back(inZone(W.props, x0, x1), x0)).toEqual(sceneProps(scene.props));
      expect(back(inZone(W.decals, x0, x1), x0)).toEqual(scene.decals);
      expect(back(inZone(W.puddles, x0, x1), x0)).toEqual(scene.puddles);
      expect(back(inZone(W.foreground, fg, Math.round(x1 * FOREGROUND_PARALLAX)), fg)).toEqual(scene.foreground);
      // Path nodes (M2-16) move by the zone edge and carry the zone's id.
      const nodes = W.paths.nodes.filter((n) => n.x >= x0 && n.x < x1);
      expect(nodes.map(({ zone: z, ...n }) => ({ ...n, x: n.x - x0, z }))).toEqual(
        scene.paths.nodes.map((n) => ({ ...n, z: id })),
      );
      const flies = W.fireflies.filter((f) => f.x0 >= x0 && f.x0 < x1);
      expect(flies.map((f) => ({ ...f, x0: f.x0 - x0, x1: f.x1 - x0 }))).toEqual(
        scene.fireflies ? [scene.fireflies] : [],
      );
    },
  );

  it('the suburb foreground starts at round(768 × 1.2) = 922 in the foreground layer', () => {
    expect(zone('suburb').x0).toBe(768);
    const first = KHORTYTSIA_SUBURB.foreground[0];
    expect(W.foreground.find((p) => p.x === 922 + (first?.x ?? 0))).toBeDefined();
  });

  it('women never stand in the Sich and nothing of a zone leaves it', () => {
    const sich = zone('sich');
    // Only Cossacks walk the Sich's inside: a woman's sprite is always a villager, a Cossack's a Cossack (a food cart,
    // M2-20, is a cart; the visitors, M2-21, are visitors — the visitor role never enters a Cossack-only node).
    for (const a of W.agents) {
      const role = /^(kozak|otaman|vartovyi)\./.test(a.sprite)
        ? 'cossack'
        : a.sprite.startsWith('viz.')
          ? 'cart'
          : isVisitorSprite(a.sprite)
            ? 'visitor'
            : 'villager';
      expect(a.role, a.sprite).toBe(role);
    }
    for (const n of W.paths.nodes.filter((q) => q.x >= sich.x0 && q.kind !== 'gate')) {
      expect(n.only, n.id).toEqual(['cossack']);
    }
    for (const [id, scene] of SCENES) {
      for (const p of [...scene.props, ...scene.decals, ...scene.puddles]) {
        expect(p.x, `${id} ${String(p.x)}`).toBeGreaterThanOrEqual(0);
        expect(p.x, `${id} ${String(p.x)}`).toBeLessThan(scene.width);
      }
      for (const n of scene.paths.nodes) {
        expect(n.x, n.id).toBeGreaterThanOrEqual(0);
        expect(n.x, n.id).toBeLessThan(scene.width);
      }
    }
  });

  it('the Dnipro runs behind the farm and the suburb and ends at the Sich (its rampart hides the river)', () => {
    expect(W.river).toMatchObject({ x0: 0, x1: zone('sich').x0 });
    expect(W.segments.find((s) => s.x0 === zone('sich').x0)?.groundHaze).toBe(false);
  });

  it('the Dnipro ends on a ragged, stepped bank (M2-29 A2): held cuts and jumps, never one straight diagonal', () => {
    const river = W.river;
    const bank = river?.bank ?? [];
    expect(bank).toHaveLength(river?.rows ?? -1);
    expect(bank[0]).toBe(0);
    expect(bank.at(-1)).toBe(river?.taper);
    const steps = bank.slice(1).map((b, r) => b - (bank[r] ?? 0));
    for (const s of steps) expect(s).toBeGreaterThanOrEqual(0);
    // Vertical cuts (a row ends where the one above did) and runs of 3+ px, and step widths vary.
    expect(steps.filter((s) => s === 0).length).toBeGreaterThanOrEqual(5);
    expect(steps.filter((s) => s >= 3).length).toBeGreaterThanOrEqual(5);
    expect(new Set(steps).size).toBeGreaterThanOrEqual(4);
  });
});

describe('night pools and tier bands (M2-09)', () => {
  it('sets poolRx only as a positive half-width (no pool is `noPool`, never 0 or less)', () => {
    for (const p of KHORTYTSIA_WORLD.props) {
      if (p.poolRx !== undefined) expect(p.poolRx, p.sprite).toBeGreaterThan(0);
    }
  });

  it('lists every ground band upgrade in ascending tier order, after the band itself', () => {
    for (const segment of KHORTYTSIA_WORLD.segments) {
      for (const row of segment.rows) {
        const froms = (row.upgrades ?? []).map((u) => u.from);
        expect(froms, row.tile).toEqual([...froms].sort((a, b) => a - b));
        for (const f of froms) expect(f, row.tile).toBeGreaterThan(row.plot?.from ?? 0);
      }
    }
  });
});
