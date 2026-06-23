/**
 * React application entry point -- mounts the root component into the DOM.
 *
 * MAIN ENTRY POINT for the PWA. Renders `App` inside `StrictMode` for
 * development warnings. The `#root` element is defined in `index.html`.
 *
 * Downstream: `app/src/App.tsx::App` -- top-level application component
 * See also: `app/index.html` -- provides the `#root` mount element
 * See also: `app/src/index.css` -- global styles imported here
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { AppErrorBoundary } from '@/components/ErrorBoundary/AppErrorBoundary';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>,
);
