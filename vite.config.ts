import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { isDebugMode } from './src/render/debug/modes.ts';
import { cspPlugin } from './tools/lib/csp.ts';

export default defineConfig(({ mode }) => ({
  // CSP (M0-12): strict meta policy in every build (prod + --mode test), relaxed only for the dev server.
  plugins: [react(), cspPlugin()],
  define: {
    // Debug params, overlay and window.__CK__ exist only in allowlisted modes: development, test (M0-05/06).
    // A compile-time constant, so production code paths are removed by dead-code elimination.
    __CK_DEBUG__: JSON.stringify(isDebugMode(mode)),
  },
}));
