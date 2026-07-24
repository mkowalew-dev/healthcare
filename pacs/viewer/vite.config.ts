import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { resolve } from 'path';

// Cornerstone DICOM image loader uses web workers and WebAssembly codecs.
// The COOP/COEP headers below enable SharedArrayBuffer, required by those codecs.
// The production server (Nginx) must also send these headers on the viewer origin.
export default defineConfig({
  resolve: {
    alias: { '@careconnect/ui': resolve(__dirname, '../../packages/ui/src/index.ts') },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // DICOM images must never be served from cache — always fetch fresh from PACS.
      // Only the app shell (HTML/CSS/JS) is cached.
      workbox: {
        runtimeCaching: [],
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        navigateFallback: '/index.html',
      },
      manifest: {
        name: 'CareConnect PACS Viewer',
        short_name: 'PACS Viewer',
        description: 'CareConnect radiology workstation — DICOM image viewer',
        theme_color: '#0a0a0a',
        background_color: '#0a0a0a',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
    }),
  ],
  worker: {
    // Cornerstone's DICOM decoder workers must be emitted as ES modules so they
    // are compatible with Rollup code-splitting. Classic IIFE worker format is
    // incompatible with code-splitting builds (Rollup error "Invalid value 'iife'").
    format: 'es',
  },
  server: {
    host: '0.0.0.0',
    port: 5174,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 5174,
    allowedHosts: ['pacs.pseudo-co.com'],
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
});
