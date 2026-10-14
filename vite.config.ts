import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages sert le site sous /InMyFridge/
const base = process.env.GITHUB_ACTIONS ? '/InMyFridge/' : '/';

export default defineConfig({
  base,
  plugins: [
    svelte(),
    VitePWA({
      registerType: 'autoUpdate',
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
