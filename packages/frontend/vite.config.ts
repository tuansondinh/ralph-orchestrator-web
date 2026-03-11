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
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            return undefined
          }

          if (id.includes('/@xterm/')) {
            return 'vendor-xterm'
          }

          if (id.includes('/react-markdown/')) {
            return 'vendor-markdown'
          }

          if (id.includes('/yaml/')) {
            return 'vendor-yaml'
          }

          if (
            id.includes('/@tanstack/') ||
            id.includes('/@trpc/') ||
            id.includes('/@supabase/')
          ) {
            return 'vendor-data'
          }

          return undefined
        }
      }
    }
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.jsx', '.js', '.mjs', '.json'],
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@ralph-ui/backend': fileURLToPath(new URL('../backend/src', import.meta.url))
    }
  },
  server: {
    port: Number(process.env.VITE_PORT ?? 5174),
    strictPort: true,
    proxy: {
      '/auth/github': {
        target: resolveBackendOrigin(),
        changeOrigin: true
      },
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
