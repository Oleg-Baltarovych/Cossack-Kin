import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import master from '../../../assets-src/palettes/master.json';
import { applyPalette, roleColors, UI_RECIPES, UI_ROLES, uiScale } from '../../../src/ui/theme.ts';

const UI_DIR = join(import.meta.dirname, '../../../src/ui');

describe('uiScale (M1-17)', () => {
  it('one font px is a whole number of device px at every common DPR (the pixel font stays crisp)', () => {
    for (const dpr of [1, 1.5, 2, 2.625, 3, 3.5]) {
      const s = uiScale(390, 844, dpr);
      for (const size of [s.fontS, s.fontM]) {
        const devicePerFontPx = (size * dpr) / 8;
        expect(Math.abs(devicePerFontPx - Math.round(devicePerFontPx))).toBeLessThan(1e-9);
      }
      expect(s.fontM).toBeGreaterThan(s.fontS);
    }
  });

  it('390 css px at DPR 3: one logical px = 1 css px, row text 10.67 px, HUD counters 16 px', () => {
    const s = uiScale(390, 844, 3);
    expect(s.px).toBe(1);
    expect(s.fontS).toBeCloseTo(32 / 3, 9);
    expect(s.fontM).toBe(16);
  });

  it('tap targets: at least 44 css px and a whole number of logical px', () => {
    for (const [w, h, dpr] of [
      [390, 844, 3],
      [360, 800, 3],
      [412, 915, 3.5],
      [390, 844, 2],
    ] as const) {
      const s = uiScale(w, h, dpr);
      expect(s.tap).toBeGreaterThanOrEqual(44);
      expect(Math.abs(s.tap / s.px - Math.round(s.tap / s.px))).toBeLessThan(1e-9);
      expect(s.tap - s.px).toBeLessThan(44);
    }
    expect(uiScale(412, 915, 3.5).tap).toBeCloseTo((39 * 4) / 3.5, 9);
  });
});

describe('colour roles (M4-16a, ADR 014)', () => {
  const palette = new Set(Object.values(master.ramps).flat());
  const css = readdirSync(UI_DIR, { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith('.css'))
    .map((f) => ({ file: f, text: readFileSync(join(UI_DIR, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '') }));

  it('every role resolves into a colour of master.json', () => {
    expect(Object.keys(UI_ROLES).length).toBeGreaterThan(0);
    for (const [role, hex] of Object.entries(roleColors())) {
      expect(palette.has(hex), `--ui-${role} = ${hex}`).toBe(true);
    }
  });

  it('applyPalette writes one --ui-<role> variable per role, next to the ramps', () => {
    const vars = new Map<string, string>();
    const root = { style: { setProperty: (k: string, v: string) => vars.set(k, v) } } as unknown as HTMLElement; // a stub: only setProperty is read
    applyPalette(root);
    for (const [role, hex] of Object.entries(roleColors())) expect(vars.get(`--ui-${role}`)).toBe(hex);
    expect(vars.get('--c-wood-0')).toBe(master.ramps.wood[0]);
  });

  it('UI CSS holds no colour literals and no slate (stone) ramp', () => {
    expect(css.length).toBeGreaterThan(10);
    for (const { file, text } of css) {
      expect(text, file).not.toMatch(/#[0-9a-f]{3,8}\b/i);
      expect(text, file).not.toMatch(/\b(rgba?|hsla?)\(/i);
      expect(text, file).not.toMatch(/--c-stone-/);
    }
  });

  it('every --ui-* variable the CSS reads is a role or a recipe', () => {
    const known = new Set([...Object.keys(UI_ROLES), ...UI_RECIPES]);
    for (const { file, text } of css) {
      for (const [, name] of text.matchAll(/var\(--ui-([a-z0-9-]+)/g))
        expect(known.has(name ?? ''), `${file}: --ui-${String(name)}`).toBe(true);
    }
  });
});
