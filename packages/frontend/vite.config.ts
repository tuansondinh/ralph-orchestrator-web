import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

function resolveBackendOrigin() {
  return (process.env.VITE_RALPH_ORCHESTRATOR_BACKEND_ORIGIN ?? 'http://127.0.0.1:3003').replace(
    /\/$/,
    ''
  )
}

function resolveBackendWsOrigin(backendOrigin: string) {
  return backendOrigin
    .replace(/^https:\/\//, 'wss://')
    .replace(/^http:\/\//, 'ws://')
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    extensions: ['.tsx', '.ts', '.jsx', '.js', '.mjs', '.json'],
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  server: {
    port: Number(process.env.VITE_PORT ?? 5174),
    strictPort: true,
    proxy: {
      '/chat': {
        target: resolveBackendOrigin(),
        changeOrigin: true
      },
      '/trpc': {
        target: resolveBackendOrigin(),
        changeOrigin: true
      },
      '/ws': {
        target: resolveBackendWsOrigin(resolveBackendOrigin()),
        ws: true,
        changeOrigin: true
      }
    }
  }
})
