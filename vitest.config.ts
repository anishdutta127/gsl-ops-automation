import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: ['node_modules', 'e2e', '.next', 'playwright-report'],
    // Default 5s test timeout is tight for heavy first-test-in-a-file
    // Server Component renders that pull in many JSON fixtures (audit
    // page, MOU detail, etc.). 15s gives headroom; in isolation these
    // tests run in 1-2s, the bump is for shared-suite cache pressure.
    testTimeout: 15000,
    coverage: {
      include: ['src/lib/**/*.ts'],
      exclude: ['src/lib/types.ts', 'src/lib/**/*.test.ts'],
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
})
