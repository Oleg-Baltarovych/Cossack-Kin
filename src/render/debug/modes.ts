// Build modes that get debug params, the overlay and window.__CK__ (allowlist, security M1).
// Shared by vite.config.ts (`__CK_DEBUG__`) and parseDebugParams; any other mode is treated as release.

export const DEBUG_MODES = ['development', 'test'] as const;

export function isDebugMode(mode: string): boolean {
  return (DEBUG_MODES as readonly string[]).includes(mode);
}
