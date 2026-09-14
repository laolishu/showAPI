import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }
const buildTime = new Date().toISOString().replace(/[:.]/g, '-')
const buildVersion = `v${pkg.version}-${buildTime}`

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    open: false,
  },
  build: {
    target: 'es2020',
    sourcemap: false,
  },
  define: {
    __BUILD_VERSION__: JSON.stringify(buildVersion),
  },
})
