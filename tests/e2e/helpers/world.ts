// Shared e2e helpers for the world canvas: deterministic navigation and debug stats (`window.__CK__`).
import { expect, type Page } from '@playwright/test';
import type {} from '../../../src/render/debug/index.ts';

export interface WorldStats {
  readonly drawCalls: number;
  readonly scale: number;
  readonly logicalW: number;
  readonly logicalH: number;
  readonly frames: number;
}

/** Opens `url` and waits until the first world frame reached the canvas (`body[data-ready="1"]`). */
export async function gotoReady(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await waitReady(page);
}

export async function waitReady(page: Page): Promise<void> {
  await expect(page.locator('body[data-ready="1"]')).toBeAttached();
}

export async function readStats(page: Page): Promise<WorldStats> {
  const stats = await page.evaluate(() => {
    const s = window.__CK__?.stats;
    return s
      ? { drawCalls: s.drawCalls, scale: s.scale, logicalW: s.logicalW, logicalH: s.logicalH, frames: s.frames }
      : null;
  });
  if (!stats) throw new Error('window.__CK__.stats is missing — is this a --mode test build?');
  return stats;
}

/** WebGL flavour of the world canvas (`null` = no WebGL context) and the unmasked renderer string. */
export async function readWebGl(page: Page): Promise<{ kind: 'webgl2' | 'webgl' | null; renderer: string }> {
  return page.evaluate(() => {
    const canvas = document.querySelector('#world canvas');
    if (!(canvas instanceof HTMLCanvasElement)) return { kind: null, renderer: '' };
    // getContext with the type Pixi already created returns that context; another type returns null.
    const gl2 = canvas.getContext('webgl2');
    const gl = gl2 ?? canvas.getContext('webgl');
    if (!gl) return { kind: null, renderer: '' };
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = info
      ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL))
      : String(gl.getParameter(gl.RENDERER));
    return { kind: gl2 ? 'webgl2' : 'webgl', renderer };
  });
}
