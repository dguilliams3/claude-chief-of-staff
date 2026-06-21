import path from 'path';
import { existsSync, readFileSync } from 'fs';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { execSync } from 'child_process';
import { manifest } from './layers/pwa/manifest.ts';

/** 
 * Appends local/theme.css to index.css if the override file exists.
 * Tested by: `app/__tests__/local-overrides.test.ts::localThemePlugin`
 */
export function localThemePlugin(): Plugin {
  const themePath = path.resolve(__dirname, '..', 'local', 'theme.css');
  return {
    name: 'local-theme-override',
    transform(code, id) {
      if (id.endsWith('index.css') && existsSync(themePath)) {
        this.addWatchFile(themePath);
        const themeOverride = readFileSync(themePath, 'utf-8');
        return code + '\n/* local/theme.css override */\n' + themeOverride + '\n';
      }
    },
  };
}

/** App name from manifest — used for HTML title and login screen branding. */
const appName = manifest.name ?? 'Chief of Staff';

const commitHash = (() => {
  try { return execSync('git rev-parse --short HEAD').toString().trim(); }
  catch { return 'dev'; }
})();

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  define: {
    __COMMIT_HASH__: JSON.stringify(commitHash),
    __APP_NAME__: JSON.stringify(appName),
  },
  publicDir: 'public',
  plugins: [
    {
      name: 'inject-app-name',
      transformIndexHtml(html) {
        return html.replace('<title>Chief of Staff</title>', `<title>${appName}</title>`);
      },
    },
    react(),
    tailwindcss(),
    localThemePlugin(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,png,svg,ico,woff2}'],
      },
      manifest,
    }),
  ],
});
