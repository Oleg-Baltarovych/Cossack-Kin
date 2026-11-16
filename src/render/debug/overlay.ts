// Dev-only debug overlay DOM (plan M0-06). English, outside i18n; text only (no innerHTML).
import { rampCss } from '../palette.ts';
import type { DebugStats } from './index.ts';

export interface Overlay {
  update(stats: DebugStats): void;
  destroy(): void;
}

export function formatStats(stats: DebugStats): string {
  return [
    `fps   ${stats.fps.toFixed(1)}`,
    `frame ${stats.frameMs.toFixed(2)} ms`,
    `draw  ${String(stats.drawCalls)}`,
    `parts ${String(stats.particles)}`,
    `scale x${String(stats.scale)}`,
    `view  ${String(stats.logicalW)}x${String(stats.logicalH)}`,
    `qual  ${stats.quality}`,
  ].join('\n');
}

export function createOverlay(parent: HTMLElement): Overlay {
  const el = document.createElement('pre');
  el.dataset.testid = 'debug-overlay';
  Object.assign(el.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    margin: '0',
    padding: '4px 6px',
    font: '11px/1.25 ui-monospace, Consolas, monospace',
    color: rampCss('plaster', -1),
    background: rampCss('ink', 0),
    opacity: '0.85',
    pointerEvents: 'none',
    zIndex: '1000',
  } satisfies Partial<CSSStyleDeclaration>);
  parent.appendChild(el);
  return {
    update: (stats) => {
      el.textContent = formatStats(stats);
    },
    destroy: () => {
      el.remove();
    },
  };
}
