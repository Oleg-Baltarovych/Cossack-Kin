import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { installChunkReload } from './platform/chunkReload.ts';
import { claimTab } from './platform/singleTab.ts';
import { App } from './ui/App.tsx';
import { OtherTab, StartError } from './ui/components/OtherTab.tsx';
import { initGame } from './ui/game.ts';
import './ui/global.css';
import { applyPalette, trackScale } from './ui/theme.ts';
import { parseDebugParams } from './render/debug/params.ts';

const container = document.getElementById('root');
if (!container) throw new Error('#root element is missing in index.html');

// Palette and pixel scale before the first render, so the UI never paints unstyled; both live as long as the page.
applyPalette(document.documentElement);
trackScale(document.documentElement);
// «Менше руху» (SPEC §6.8) for the DOM: CSS keys reduced motion off `data-motion` as well as prefers-reduced-motion.
// Until the settings screen (M2) the game's switch is the dev/test `?still` (the world reads the same flag).
if (__CK_DEBUG__ && parseDebugParams(window.location.search, import.meta.env.MODE).still)
  document.documentElement.dataset.motion = 'reduced';

// A page restored from the back/forward cache holds a stale game (and maybe no tab lock): start over from the save.
window.addEventListener('pageshow', (e) => {
  if (e.persisted) window.location.reload();
});

// A stale deploy (old entry, missing lazy chunk) reloads once (M2-04).
installChunkReload();

const root = createRoot(container);

// One tab owns the game (and its save); the save loads once, before React (a StrictMode double mount never reloads it).
async function start(): Promise<void> {
  const claim = await claimTab();
  const game = claim === 'owner' ? await initGame() : null;
  root.render(<StrictMode>{game ? <App game={game} /> : <OtherTab />}</StrictMode>);
}

start().catch((error: unknown) => {
  console.error('game start failed', error);
  root.render(<StartError />);
});
