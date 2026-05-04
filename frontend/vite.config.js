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
  }
})
