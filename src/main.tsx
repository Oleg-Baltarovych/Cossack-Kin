import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App.tsx';
import './ui/global.css';
import { applyPalette, trackScale } from './ui/theme.ts';

const container = document.getElementById('root');
if (!container) throw new Error('#root element is missing in index.html');

// Palette and pixel scale before the first render, so the UI never paints unstyled; both live as long as the page.
applyPalette(document.documentElement);
trackScale(document.documentElement);

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
