import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { claimTab } from './platform/singleTab.ts';
import { App } from './ui/App.tsx';
import { OtherTab } from './ui/components/OtherTab.tsx';
import { initGame } from './ui/game.ts';
import './ui/global.css';
import { applyPalette, trackScale } from './ui/theme.ts';

const container = document.getElementById('root');
if (!container) throw new Error('#root element is missing in index.html');

// Palette and pixel scale before the first render, so the UI never paints unstyled; both live as long as the page.
applyPalette(document.documentElement);
trackScale(document.documentElement);

// One tab owns the game (and its save); the save loads once, before React (a StrictMode double mount never reloads it).
async function start(root: HTMLElement): Promise<void> {
  const claim = await claimTab();
  const game = claim === 'owner' ? await initGame() : null;
  createRoot(root).render(<StrictMode>{game ? <App game={game} /> : <OtherTab />}</StrictMode>);
}

start(container).catch((error: unknown) => {
  console.error('game start failed', error);
});
