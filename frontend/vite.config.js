/* global process */
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd() + '/..', '')
  const port = parseInt(env.VITE_PORT || 3055)
  const apiPort = parseInt(env.PORT || 6767)

  return {
    plugins: [react()],
    envDir: '../',
    server: {
      host: '0.0.0.0',
      port: port,
      strictPort: true,
      proxy: {
        '/api': {
          target: `http://127.0.0.1:${apiPort}`,
          changeOrigin: true,
        },
      },
    },
    build: {
      chunkSizeWarningLimit: 1200,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router-dom')) return 'react-vendor'
            if (id.includes('antd') || id.includes('@ant-design') || id.includes('rc-')) return 'antd-vendor'
            if (id.includes('recharts') || id.includes('d3-')) return 'charts-vendor'
            if (id.includes('xlsx')) return 'xlsx-vendor'
            if (id.includes('papaparse')) return 'export-vendor'
            return undefined
          },
        },
      },
    },
  }
})
