import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 3055,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:6767',
        changeOrigin: true,
      },
    },
  },
})
