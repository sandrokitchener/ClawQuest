import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const host = process.env.TAURI_DEV_HOST
const isDebug = Boolean(process.env.TAURI_ENV_DEBUG)
const isWindowsTarget = process.env.TAURI_ENV_PLATFORM === 'windows'

export default defineConfig({
  clearScreen: false,
  envPrefix: ['VITE_', 'TAURI_ENV_'],
  plugins: [react()],
  server: {
    port: 1420,
    strictPort: true,
    host: host || '127.0.0.1',
    hmr: host
      ? {
          protocol: 'ws',
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
  preview: {
    host: '127.0.0.1',
    port: 1421,
    strictPort: true,
  },
  build: {
    target: isWindowsTarget ? 'chrome105' : 'safari13',
    minify: isDebug ? false : 'esbuild',
    sourcemap: isDebug,
  },
})
