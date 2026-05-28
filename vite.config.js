import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiEndpoint = env.VITE_API_ENDPOINT || 'http://localhost:4567';

  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api': {
          target: apiEndpoint,
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/api/, '/api')
        }
      }
    }
  }
})
