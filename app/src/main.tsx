import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './lib/tokens.css';
import './index.css';

// Build marker — exposed on window so it can't be tree-shaken. If the
// app ever blanks-out due to a Vercel SPA-rewrite cache-poisoning issue
// (where /assets/index-*.js was momentarily served as index.html and
// got pinned by the immutable cache header), bumping this date forces
// Vite to emit a fresh bundle hash and breaks browsers out of the bad
// cached response.
(window as Window & { __WARDROBE_BUILD?: string }).__WARDROBE_BUILD = '2026-05-24T20:30';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
