import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

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
})
