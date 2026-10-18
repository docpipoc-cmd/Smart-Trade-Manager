import { resolve } from 'path'
import { realpathSync } from 'fs'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

// realpath: AppData folders can be redirected on Windows (packaged apps), which
// otherwise makes Vite think the source files are outside the project root.
const base = realpathSync.native(__dirname)

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: { rollupOptions: { input: resolve(base, 'electron/main.ts') } }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: { rollupOptions: { input: resolve(base, 'electron/preload.ts') } }
  },
  renderer: {
    root: resolve(base, 'src'),
    plugins: [react()],
    build: { rollupOptions: { input: resolve(base, 'src/index.html') } }
  }
})
