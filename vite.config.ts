import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import { resolve } from 'path'

export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        entry: 'electron/main.ts',
        onstart(args) {
          args.startup()
        },
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              external: [
                'electron',
                'electron-store',
                // Playwright and all its internals - cannot be bundled
                'playwright-core',
                'playwright',
                /^playwright-core\/.*/,
                /^chromium-bidi\/.*/,
                'chromium-bidi',
                // Node.js built-ins that playwright uses
                'child_process',
                'fs',
                'path',
                'os',
                'net',
                'http',
                'https',
                'stream',
                'util',
                'events',
                'buffer',
                'url',
                'crypto',
              ]
            }
          }
        }
      },
      {
        entry: 'electron/preload.ts',
        onstart(args) {
          args.reload()
        },
        vite: {
          build: {
            outDir: 'dist-electron'
          }
        }
      }
    ]),
    renderer()
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
})
