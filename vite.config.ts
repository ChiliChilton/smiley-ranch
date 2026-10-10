import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
const DEMO = process.env.VITE_DEMO === '1'
// GitHub Pages serves from /<repo>/ ; set VITE_BASE=/back40/ in that build. Vercel and custom domains use '/'.
const BASE = DEMO ? './' : (process.env.VITE_BASE ?? '/')

export default defineConfig({
  base: BASE,
  define: { __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '0.0.0') },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      disable: DEMO,
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'favicon.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'Back 40',
        short_name: 'Back 40',
        description:
          "Who's hunting where, what's happening on the place, what needs doing, and what we need to buy.",
        start_url: BASE,
        scope: BASE,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#f8f2e8',
        theme_color: '#8c3d1f',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // App shell: everything Vite emits is precached so the app opens with no signal.
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        importScripts: ['push-sw.js'],
        navigateFallback: BASE + 'index.html',
        // Never let the service worker answer Supabase calls.
        navigateFallbackDenylist: [/^\/~oauth/],
        runtimeCaching: [
          {
            // Satellite tiles (used from Phase 2 on): keep recently viewed tiles around.
            urlPattern: /^https:\/\/server\.arcgisonline\.com\/.*\/tile\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'map-tiles',
              expiration: { maxEntries: 1500, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
})
