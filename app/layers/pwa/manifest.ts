import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import type { ManifestOptions } from 'vite-plugin-pwa';

const defaultManifest: Partial<ManifestOptions> = {
  name: 'Chief of Staff',
  short_name: 'CoS',
  start_url: '/',
  display: 'standalone',
  background_color: '#2d2824',
  theme_color: '#c87941',
  icons: [
    { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
  ],
};

/** 
 * Loads manifest, merging local/pwa.json overrides if present.
 * Tested by: `app/__tests__/local-overrides.test.ts::loadManifest`
 */
export function loadManifest(): Partial<ManifestOptions> {
  const localPath = resolve(__dirname, '..', '..', '..', 'local', 'pwa.json');
  if (existsSync(localPath)) {
    try {
      const overrides = JSON.parse(readFileSync(localPath, 'utf-8'));
      return { ...defaultManifest, ...overrides };
    } catch {
      console.warn('Invalid JSON in local/pwa.json — falling back to defaults');
    }
  }
  return defaultManifest;
}

export const manifest = loadManifest();
