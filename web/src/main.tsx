import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import Root from './Root.tsx';
import { applyTheme, readTheme } from './theme.ts';
import './index.css';

// Applied before the first render so a dark-theme visitor never sees a light
// flash. With nothing stored this resolves to light, which is the default.
applyTheme(readTheme());

const root = document.getElementById('root');
if (!root) throw new Error('#root not found');

createRoot(root).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
