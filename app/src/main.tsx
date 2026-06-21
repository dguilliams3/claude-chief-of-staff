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
import { StrictMode, Component } from 'react';
import type { ReactNode, ErrorInfo } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('React crash:', error, info.componentStack);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 24, color: '#e8e2d9', fontFamily: 'monospace', fontSize: 14 }}>
          <h1 style={{ color: '#e07050' }}>App Crash</h1>
          <pre style={{ whiteSpace: 'pre-wrap', marginTop: 12 }}>{this.state.error.message}</pre>
          <pre style={{ whiteSpace: 'pre-wrap', marginTop: 8, opacity: 0.6, fontSize: 11 }}>{this.state.error.stack}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
