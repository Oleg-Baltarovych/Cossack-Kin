// Lint fixture: linted by tests/unit/lint/core-purity.test.ts under a virtual `src/core/…` path.
// Every line tagged `expect: <rule>` must produce exactly that core-purity error; untagged lines must be clean.
// Rule ids mirror the six checks in .claude/hooks/core-purity.mjs.
// This file is excluded from `pnpm lint` and `pnpm typecheck` (it is wrong on purpose).
import { Application } from 'pixi.js'; // expect: render-package
import { GodrayFilter } from 'pixi-filters'; // expect: render-package
import { useState } from 'react'; // expect: render-package
import { createRoot } from 'react-dom/client'; // expect: render-package
import { Capacitor } from '@capacitor/core'; // expect: render-package
import { Assets } from '@pixi/assets'; // expect: render-package
import { Howl } from 'howler'; // expect: render-package
import { camera } from '../render/camera.ts'; // expect: outer-layer
import { t } from '../../i18n/index.ts'; // expect: outer-layer
import { storage } from '../platform/index.ts'; // expect: outer-layer

export const used = [Application, GodrayFilter, useState, createRoot, Capacitor, Assets, Howl, camera, t, storage];

export const a = Date.now(); // expect: clock
export const b = new Date(); // expect: clock
export const c = performance.now(); // expect: clock
export const d = Math.random(); // expect: random
export const e = window.innerWidth; // expect: browser-global
export const f = document.title; // expect: browser-global
export const g = navigator.language; // expect: browser-global
export const h = localStorage.getItem('k'); // expect: browser-global
export const i = sessionStorage.length; // expect: browser-global
export const j = indexedDB.open('db'); // expect: browser-global
setTimeout(() => undefined, 1); // expect: timer
setInterval(() => undefined, 1); // expect: timer
requestAnimationFrame(() => undefined); // expect: timer
