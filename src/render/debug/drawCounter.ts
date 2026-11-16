// Dev-only draw-call counter (plan M0-06): wraps the draw methods of the renderer's GL context.
// Pixi v8 issues every draw (batches, filter passes, upscale blit) through GlGeometrySystem /
// GlParticleContainerAdaptor via these methods, so filter passes are counted too.

const DRAW_METHODS = ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced'] as const;

export interface DrawCounter {
  /** Draw calls since the last reset. */
  count(): number;
  reset(): void;
  uninstall(): void;
}

export function installDrawCounter(gl: object): DrawCounter {
  const target = gl as Record<string, unknown>;
  const restore: (() => void)[] = [];
  let calls = 0;

  for (const name of DRAW_METHODS) {
    const original: unknown = target[name];
    if (typeof original !== 'function') continue;
    const hadOwn = Object.hasOwn(target, name);
    target[name] = function counted(this: unknown, ...args: unknown[]): unknown {
      calls += 1;
      return Reflect.apply(original, this, args) as unknown;
    };
    restore.push(() => {
      if (hadOwn) target[name] = original;
      else Reflect.deleteProperty(target, name);
    });
  }

  return {
    count: () => calls,
    reset: () => {
      calls = 0;
    },
    uninstall: () => {
      for (const undo of restore) undo();
      restore.length = 0;
    },
  };
}
