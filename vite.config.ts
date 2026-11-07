import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig, loadEnv, type ProxyOptions } from 'vite'
import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const printer = env.VITE_PRINTER_HOST

  // With VITE_PRINTER_HOST set, the dev server proxies Moonraker and the webcam the
  // same way nginx does in production, so the UI stays same-origin (no CORS setup).
  const moonraker: ProxyOptions = { target: `http://${printer}:7125`, changeOrigin: true }
  const proxy: Record<string, ProxyOptions> | undefined = printer
    ? {
        '/websocket': { ...moonraker, ws: true },
        '^/(printer|api|access|machine|server)/': moonraker,
        '/webcam': { target: `http://${printer}`, changeOrigin: true },
      }
    : undefined

  return {
    base: './',
    plugins: [svelte()],
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
    },
    server: { proxy },
  }
})
