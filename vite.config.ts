import { defineConfig, type Plugin } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

/**
 * OCR : moteur Tesseract et données « français » servis par l'app (pas de CDN),
 * copiés depuis node_modules au build. Trop gros pour le précache : mis en cache
 * à la première utilisation (voir runtimeCaching).
 */
const require = createRequire(import.meta.url);
const pkg = (name: string) => dirname(require.resolve(`${name}/package.json`));
const TESSERACT: Record<string, string> = {
  'worker.min.js': join(pkg('tesseract.js'), 'dist/worker.min.js'),
  'tesseract-core-lstm.wasm.js': join(pkg('tesseract.js-core'), 'tesseract-core-lstm.wasm.js'),
  'tesseract-core-simd-lstm.wasm.js': join(pkg('tesseract.js-core'), 'tesseract-core-simd-lstm.wasm.js'),
  'tesseract-core-relaxedsimd-lstm.wasm.js': join(pkg('tesseract.js-core'), 'tesseract-core-relaxedsimd-lstm.wasm.js'),
  'fra.traineddata.gz': join(pkg('@tesseract.js-data/fra'), '4.0.0_best_int/fra.traineddata.gz')
};
const tesseract: Plugin = {
  name: 'tesseract-assets',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      const file = TESSERACT[req.url?.split('?')[0].replace(/^.*\/tesseract\//, '') ?? ''];
      if (!req.url?.includes('/tesseract/') || !file) return next();
      res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : 'application/octet-stream');
      res.end(readFileSync(file));
    });
  },
  generateBundle() {
    for (const [name, file] of Object.entries(TESSERACT))
      this.emitFile({ type: 'asset', fileName: `tesseract/${name}`, source: readFileSync(file) });
  }
};

// GitHub Pages sert le site sous /InMyFridge/
const base = process.env.GITHUB_ACTIONS ? '/InMyFridge/' : '/';

export default defineConfig({
  base,
  plugins: [
    svelte(),
    tesseract,
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,mjs,css,html,png,svg,webmanifest}'],
        globIgnores: ['**/tesseract/**'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: /\/tesseract\//,
            handler: 'CacheFirst',
            options: { cacheName: 'tesseract', expiration: { maxEntries: 10 } }
          }
        ]
      },
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'InMyFridge',
        short_name: 'InMyFridge',
        description: 'Ce qu’il y a chez moi, ce qu’il me manque, ce que je peux cuisiner.',
        lang: 'fr',
        theme_color: '#16a34a',
        background_color: '#f7f7f2',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '.',
        scope: '.',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      }
    })
  ]
});
