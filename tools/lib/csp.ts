// Content-Security-Policy for the web build (plan M0-12, security.md). The strict policy is injected into
// index.html for every `vite build` (production and `--mode test`, so e2e runs under the same policy); the
// dev server gets a relaxed one, because Vite's dev client needs an inline React-refresh preamble, inline
// <style> tags for CSS and a HMR WebSocket. Production is never relaxed.
//
// `frame-ancestors` is not in the meta policy: browsers ignore it in <meta> (and Chromium logs an error
// for it), so anti-framing must come from an HTTP header if the web build is ever hosted (M9).
import type { Plugin } from 'vite';

export const PROD_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
].join('; ');

export const DEV_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "connect-src 'self' ws: wss:",
  "object-src 'none'",
  "base-uri 'none'",
].join('; ');

/** Vite plugins: strict CSP for build, relaxed CSP for the dev server. `pnpm check:dist` verifies dist/index.html. */
export function cspPlugin(): Plugin[] {
  const inject = (policy: string) => () => [
    {
      tag: 'meta',
      attrs: { 'http-equiv': 'Content-Security-Policy', content: policy },
      injectTo: 'head-prepend' as const,
    },
  ];
  return [
    { name: 'ck-csp-build', apply: 'build', transformIndexHtml: inject(PROD_CSP) },
    { name: 'ck-csp-serve', apply: 'serve', transformIndexHtml: inject(DEV_CSP) },
  ];
}
