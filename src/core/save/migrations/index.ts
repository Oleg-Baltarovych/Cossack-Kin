// The save migration chain (SPEC §9.5, rules/save.md; plan M1-13). One pure step per version bump,
// `migrations/NNN-vX-to-vY.ts`, registered here in order (use /save-migration). Empty at v1.
import { STATE_VERSION } from '../../state.ts';

export interface Migration {
  readonly from: number;
  readonly to: number;
  /** Raw payload of version `from` → raw payload of version `to` (validated after the whole chain). */
  readonly run: (raw: unknown) => unknown;
}

export const MIGRATIONS: readonly Migration[] = [];

export type MigrateResult = { readonly ok: true; readonly value: unknown } | { readonly ok: false };

/** Walks `raw` from `version` up to `target` one registered step at a time; a missing step is an error. */
export function migrate(
  raw: unknown,
  version: number,
  chain: readonly Migration[] = MIGRATIONS,
  target: number = STATE_VERSION,
): MigrateResult {
  let value = raw;
  for (let v = version; v < target;) {
    const step = chain.find((m) => m.from === v);
    if (!step || step.to <= v) return { ok: false };
    // A step that chokes on a damaged payload refuses the save; it never crashes the boot.
    try {
      value = step.run(value);
    } catch {
      return { ok: false };
    }
    v = step.to;
  }
  return { ok: true, value };
}
