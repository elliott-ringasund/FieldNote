import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      injectRegister: false,
      registerType: 'autoUpdate',
      includeAssets: ['fieldnote-icon.svg'],
      manifest: {
        name: 'FieldNote — Field Data Collection',
        short_name: 'FieldNote',
        description: 'Offline-safe project, geometry, route and observation collection for field teams.',
        theme_color: '#183d37',
        background_color: '#183d37',
        display: 'standalone',
        orientation: 'portrait-primary',
        icons: [
          { src: '/fieldnote-icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        globPatterns: ['**/*.{js,css,html,svg}'],
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,
      },
    }),
  ],
})
