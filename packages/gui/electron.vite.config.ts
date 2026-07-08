import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    // @terrarium/core is a workspace TS package with ZERO runtime deps, published as
    // raw source (exports -> ./src/index.ts). Exclude it from externalization so it gets
    // bundled+transpiled into the main process (Node can't require raw .ts otherwise).
    plugins: [externalizeDepsPlugin({ exclude: ['@terrarium/core'] })],
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    resolve: {
      alias: { '@': resolve('src/renderer/src') },
    },
    plugins: [react()],
  },
})
