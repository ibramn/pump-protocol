import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    // Proxy is only used in development when client and server are on same machine
    // For production, use environment variable VITE_API_URL instead
    proxy: {
      '/api': {
        target: process.env.VITE_API_URL || 'http://localhost:3001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '/api')
      },
      '/ws': {
        target: process.env.VITE_API_URL?.replace('http', 'ws') || 'ws://localhost:3001',
        ws: true
      }
    }
  }
})

