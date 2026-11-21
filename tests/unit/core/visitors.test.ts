// Visitors' timetable (plan M2-21, SPEC §2.6): a pure function of (seed, time) — slots like the wind, never state.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { VISITOR_IDS, VISITOR_SCHEDULE, type VisitorId } from '../../../src/content/visitors.ts';
import { visitOfSlot, visitorAt, visitSlot } from '../../../src/core/systems/visitors.ts';

const SLOT_MS = VISITOR_SCHEDULE.slotSec * 1000;
const T0 = 1_780_315_800_000;
const SLOT0 = Math.floor(T0 / SLOT_MS);

describe('visitorAt (M2-21)', () => {
  it('is pinned: shipped seeds keep their visitors (golden schedule)', () => {
    const at = (seed: number): string =>
      Array.from({ length: 12 }, (_, k) => {
        const v = visitOfSlot(seed, SLOT0 + k);
        return v ? `${v.visitor}+${String((v.start - (SLOT0 + k) * SLOT_MS) / 1000)}` : '-';
      }).join(' ');
    expect(at(1)).toMatchInlineSnapshot(`"- lirnyk+104 korobeinyk+333 - - chumak+86 - - kobzar+398 chumak+110 - -"`);
    expect(at(2)).toMatchInlineSnapshot(
      `"kobzar+6 korobeinyk+480 chumak+62 - kobzar+277 - chumak+451 kobzar+1 - chumak+146 kobzar+172 kobzar+15"`,
    );
  });

  it('gives the same answer for (seed, t) in any order, and differs between seeds', () => {
    const times = Array.from({ length: 400 }, (_, i) => T0 + i * 61_000);
    const forward = times.map((t) => visitorAt(7, t)?.visitor ?? null);
    const backward = [...times]
      .reverse()
      .map((t) => visitorAt(7, t)?.visitor ?? null)
      .reverse();
    expect(backward).toEqual(forward);
    const other = times.map((t) => visitorAt(8, t)?.visitor ?? null);
    expect(other).not.toEqual(forward);
  });

  it('a visit lies inside its slot, lasts its content duration, and slots never overlap', () => {
    let last = -Infinity;
    for (let k = 0; k < 2000; k++) {
      const slot = SLOT0 + k;
      const v = visitOfSlot(3, slot);
      if (!v) continue;
      expect(v.slot).toBe(slot);
      expect(v.start).toBeGreaterThanOrEqual(slot * SLOT_MS);
      expect(v.end).toBeLessThanOrEqual((slot + 1) * SLOT_MS);
      expect(v.end - v.start).toBe(VISITOR_SCHEDULE.visitors[v.visitor].durationS * 1000);
      expect(v.start).toBeGreaterThanOrEqual(last);
      last = v.end;
    }
  });

  it('visitorAt is the slot visit exactly inside [start, end), else nobody', () => {
    for (let k = 0; k < 300; k++) {
      const v = visitOfSlot(5, SLOT0 + k);
      if (!v) {
        expect(visitorAt(5, (SLOT0 + k) * SLOT_MS + SLOT_MS / 2)).toBeNull();
        continue;
      }
      expect(visitSlot(v.start)).toBe(v.slot);
      expect(visitorAt(5, v.start)).toEqual(v);
      expect(visitorAt(5, v.end - 1)).toEqual(v);
      expect(visitorAt(5, v.end)).toBeNull();
      if (v.start > v.slot * SLOT_MS) expect(visitorAt(5, v.start - 1)).toBeNull();
    }
  });

  it('over many slots each visitor comes by its weight and visits fill the content chance (±0.03)', () => {
    const counts: Record<VisitorId, number> = { kobzar: 0, lirnyk: 0, chumak: 0, korobeinyk: 0, hanchar: 0 };
    const slots = 20_000;
    let visits = 0;
    for (let k = 0; k < slots; k++) {
      const v = visitOfSlot(11, SLOT0 + k);
      if (!v) continue;
      visits += 1;
      counts[v.visitor] += 1;
    }
    expect(Math.abs(visits / slots - VISITOR_SCHEDULE.chance)).toBeLessThan(0.03);
    const total = VISITOR_IDS.reduce((s, id) => s + VISITOR_SCHEDULE.visitors[id].weight, 0);
    for (const id of VISITOR_IDS)
      expect(Math.abs(counts[id] / visits - VISITOR_SCHEDULE.visitors[id].weight / total), id).toBeLessThan(0.03);
  });
});

describe('visitors never touch the economy or the state (M2-21)', () => {
  it('no core module imports the visitors but the schedule itself (it reads the content table)', () => {
    const files = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? files(join(dir, e.name)) : e.name.endsWith('.ts') ? [join(dir, e.name)] : [],
      );
    const importers = files('src/core').filter((f) => /from '[^']*visitors\.ts'/.test(readFileSync(f, 'utf8')));
    expect(importers.map((f) => f.replace(/\\/g, '/'))).toEqual(['src/core/systems/visitors.ts']);
  });

  it('the content durations fit their slot (a visit never spills into the next one)', () => {
    // start = slot start + floor(u × (slotSec − durationS + 1)) s, u < 1: the end stays ≤ the slot's end iff this holds.
    for (const id of VISITOR_IDS)
      expect(VISITOR_SCHEDULE.visitors[id].durationS).toBeLessThanOrEqual(VISITOR_SCHEDULE.slotSec);
  });
});
