import { defineConfig, loadEnv } from 'vite'

// Standalone config: frontend talks to its own backend via a dev proxy on /api,
// so the app does NOT depend on any path from the parent ("mother") project.
//
// @vitejs/plugin-react e încărcat dinamic: dacă e instalat, îl folosim (cu Fast
// Refresh). Dacă lipsește, cădem pe transformarea JSX nativă din esbuild, ca
// aplicația să pornească oricum cu `vite` simplu.
export default defineConfig(async ({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const backendPort = env.CHATBOT_BACKEND_PORT || '3002'
  const backendUrl = env.VITE_BACKEND_URL || `http://localhost:${backendPort}`

  let plugins = []
  let esbuild
  try {
    const react = (await import('@vitejs/plugin-react')).default
    plugins = [react()]
  } catch {
    esbuild = { jsx: 'automatic' }
  }

  return {
    plugins,
    esbuild,
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: backendUrl,
          changeOrigin: true
        }
      }
    }
  }
})
