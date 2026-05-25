import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.VITE_API_URL || 'http://localhost:3001',
        changeOrigin: true,
      },
      // BFF proxy — forwards /bff/* to the local BFF service (port 3003).
      // Run `cd bff && npm run dev` alongside the backend to use this.
      '/bff': {
        target: 'http://localhost:3003',
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      // Multi-page build: two separate HTML entry points, one bundle per portal.
      // Nginx serves index.html for careconnect.pseudo-co.com and
      // patient.html for mychart.pseudo-co.com from the same dist/ directory.
      input: {
        main:    resolve(__dirname, 'index.html'),    // CareConnect clinical portal
        patient: resolve(__dirname, 'patient.html'),  // MyChart patient portal
      },
      output: {
        manualChunks: {
          'vendor-react':  ['react', 'react-dom', 'react-router-dom'],
          'vendor-charts': ['recharts'],
          'vendor-otel':   ['@splunk/otel-web', '@opentelemetry/api'],
          'vendor-utils':  ['axios', 'date-fns', 'lucide-react', 'clsx', 'react-hook-form'],
        },
      },
    },
  },
})
