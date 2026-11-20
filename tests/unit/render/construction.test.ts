// Construction and tier juice (plan M2-12, Q5; SPEC §6.5/§6.7): the sequence of a new building (scaffold stages →
// pop → confetti) and of a new tier (flash, a rising standard) as pure functions of the ms since the event; whole-px
// sizes for the pop; confetti and dust on whole px. «Менше руху»: no pop, no confetti, no dust, no flash — but the
// scaffold stages and the standard (information) stay.
import { describe, expect, it } from 'vitest';
import { BUILD } from '../../../src/render/atmosphere/config.ts';
import {
  buildFrame,
  celebrationFrame,
  celebrationStart,
  confettiPieces,
  dustPuffs,
  knocksBetween,
  popSize,
  scaffoldSize,
  SCAFFOLD_MS,
} from '../../../src/render/fx/construction.ts';

const SITE = { x: 200, y: 150, seed: 7 };

describe('buildFrame', () => {
  it('shows the 3 scaffold stages for stageMs each, then reveals the building', () => {
    expect(SCAFFOLD_MS).toBe(BUILD.stageMs * 3);
    expect(buildFrame(0, false)).toEqual({ kind: 'scaffold', stage: 0 });
    expect(buildFrame(BUILD.stageMs - 1, false)).toEqual({ kind: 'scaffold', stage: 0 });
    expect(buildFrame(BUILD.stageMs, false)).toEqual({ kind: 'scaffold', stage: 1 });
    expect(buildFrame(2 * BUILD.stageMs + 10, false)).toEqual({ kind: 'scaffold', stage: 2 });
    expect(buildFrame(SCAFFOLD_MS, false).kind).toBe('reveal');
  });

  it('pops 1 → peak → 1 within ≤ 200 ms (Q5), confetti bursts with the pop and runs out', () => {
    expect(BUILD.popMs).toBeLessThanOrEqual(200);
    const scales: number[] = [];
    for (let ms = 0; ms <= BUILD.popMs; ms += 10) {
      const f = buildFrame(SCAFFOLD_MS + ms, false);
      if (f.kind !== 'reveal') throw new Error(`no reveal at ${String(ms)}`);
      scales.push(f.scale);
      expect(f.burstMs).toBe(ms);
    }
    expect(scales[0]).toBe(1);
    expect(Math.max(...scales)).toBeCloseTo(BUILD.popPeak, 2);
    expect(scales[scales.length - 1]).toBe(1);
    const after = buildFrame(SCAFFOLD_MS + BUILD.popMs + 50, false);
    expect(after).toEqual({ kind: 'reveal', scale: 1, burstMs: BUILD.popMs + 50 });
    expect(buildFrame(SCAFFOLD_MS + BUILD.confettiMs, false)).toEqual({ kind: 'done' });
  });

  it('«менше руху»: the same scaffold stages, then done at once (no pop, no confetti)', () => {
    expect(buildFrame(BUILD.stageMs, true)).toEqual({ kind: 'scaffold', stage: 1 });
    expect(buildFrame(SCAFFOLD_MS, true)).toEqual({ kind: 'done' });
  });
});

describe('popSize', () => {
  it('is whole px, never smaller than the frame, at most round(size × peak)', () => {
    for (const [w, h] of [
      [112, 44],
      [56, 96],
      [9, 7],
    ] as const) {
      for (const k of [1, 1.02, 1.05, BUILD.popPeak]) {
        const s = popSize(w, h, k);
        expect(Number.isInteger(s.w) && Number.isInteger(s.h)).toBe(true);
        expect(s.w).toBeGreaterThanOrEqual(w);
        expect(s.h).toBeGreaterThanOrEqual(h);
        expect(s.w).toBeLessThanOrEqual(Math.round(w * BUILD.popPeak));
      }
      expect(popSize(w, h, 1)).toEqual({ w, h });
    }
  });
});

describe('scaffoldSize', () => {
  it('tall buildings get the large scaffold, low plots (fields, beds, the fair ground) the small one', () => {
    expect(scaffoldSize(56, 96)).toBe('l'); // windmill
    expect(scaffoldSize(76, 56)).toBe('l'); // khata
    expect(scaffoldSize(132, 72)).toBe('l'); // tavern
    expect(scaffoldSize(112, 44)).toBe('s'); // field
    expect(scaffoldSize(152, 64)).toBe('s'); // garden
    expect(scaffoldSize(128, 48)).toBe('s'); // fair
  });
});

describe('confettiPieces', () => {
  it('bursts BUILD.confetti pieces from the site on whole px, up first and then down, all frames used', () => {
    const early = confettiPieces(SITE, 120);
    expect(early).toHaveLength(BUILD.confetti);
    for (const p of early) {
      expect(Number.isInteger(p.x) && Number.isInteger(p.y)).toBe(true);
      expect(p.y).toBeLessThan(SITE.y);
    }
    const late = confettiPieces(SITE, BUILD.confettiMs - 50);
    const meanY = (ps: readonly { y: number }[]): number => ps.reduce((a, p) => a + p.y, 0) / ps.length;
    expect(meanY(late)).toBeGreaterThan(meanY(early));
    const frames = new Set([0, 200, 400, 600].flatMap((ms) => confettiPieces(SITE, ms).map((p) => p.frame)));
    expect(frames).toEqual(new Set([0, 1, 2, 3]));
  });

  it('spreads to both sides and repeats for the same seed and time; none once the burst is over', () => {
    const ps = confettiPieces(SITE, 300);
    expect(ps.some((p) => p.x < SITE.x) && ps.some((p) => p.x > SITE.x)).toBe(true);
    expect(confettiPieces(SITE, 300)).toEqual(ps);
    expect(confettiPieces({ ...SITE, seed: 8 }, 300)).not.toEqual(ps);
    expect(confettiPieces(SITE, BUILD.confettiMs)).toEqual([]);
  });
});

describe('dustPuffs', () => {
  it('kicks up BUILD.dust puffs at the scaffold foot while it is built, on whole px', () => {
    const puffs = dustPuffs(SITE, 500, 40);
    expect(puffs).toHaveLength(BUILD.dust);
    for (const p of puffs) {
      expect(Number.isInteger(p.x) && Number.isInteger(p.y)).toBe(true);
      expect(Math.abs(p.x - SITE.x)).toBeLessThanOrEqual(20);
      expect(p.y).toBeLessThanOrEqual(SITE.y);
      expect(p.y).toBeGreaterThanOrEqual(SITE.y - BUILD.dustRise);
    }
    const frames = new Set(
      Array.from({ length: 12 }, (_, i) => dustPuffs(SITE, i * 97, 40))
        .flat()
        .map((p) => p.frame),
    );
    expect(frames).toEqual(new Set([0, 1, 2]));
  });
});

describe('celebrationFrame', () => {
  it('flashes for a few frames, the standard rises through its 6 frames, holds, then it is over', () => {
    const at0 = celebrationFrame(0, false);
    expect(at0).toEqual({ kind: 'on', flash: 0, standard: 0 });
    const ms = 1000 / BUILD.standardFps;
    expect(celebrationFrame(ms * 2.5, false)).toMatchObject({ standard: 2 });
    expect(celebrationFrame(BUILD.flashMs, false)).toMatchObject({ flash: null });
    expect(celebrationFrame(ms * 10, false)).toMatchObject({ standard: 5 });
    expect(celebrationFrame(BUILD.celebrationMs - 1, false)).toMatchObject({ standard: 5 });
    expect(celebrationFrame(BUILD.celebrationMs, false)).toEqual({ kind: 'done' });
  });

  it('«менше руху»: no flash, the standard stands raised (its last frame) for the same time', () => {
    expect(celebrationFrame(0, true)).toEqual({ kind: 'on', flash: null, standard: 5 });
    expect(celebrationFrame(BUILD.celebrationMs, true)).toEqual({ kind: 'done' });
  });
});

describe('celebrationStart', () => {
  it('waits for a running construction of the same building to reveal it; otherwise starts now', () => {
    expect(celebrationStart(5000, null)).toBe(5000);
    expect(celebrationStart(5000, 4500)).toBe(4500 + SCAFFOLD_MS);
    expect(celebrationStart(9000, 4500)).toBe(9000);
  });
});

describe('flash frames', () => {
  it('the burst (frame 1) holds longer than the spark (frame 0)', () => {
    const span = (k: number): number =>
      Array.from({ length: BUILD.flashMs }, (_, ms) => celebrationFrame(ms, false)).filter(
        (f) => f.kind === 'on' && f.flash === k,
      ).length;
    expect(span(1)).toBeGreaterThan(span(0));
    expect(span(2)).toBeGreaterThan(0);
  });
});

describe('knocksBetween (plan M2-18: the builders knock as each scaffold stage goes up)', () => {
  it('counts the stage starts in (from, to]: one per stage, three in all, none after the reveal', () => {
    expect(knocksBetween(-1, 0)).toBe(1);
    expect(knocksBetween(0, BUILD.stageMs - 1)).toBe(0);
    expect(knocksBetween(0, BUILD.stageMs)).toBe(1);
    expect(knocksBetween(-1, SCAFFOLD_MS * 10)).toBe(3);
    expect(knocksBetween(BUILD.stageMs * 2, SCAFFOLD_MS * 10)).toBe(0);
  });
});
