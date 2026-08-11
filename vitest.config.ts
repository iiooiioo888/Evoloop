import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'shared'),
      '@kernel': resolve(__dirname, 'kernel/src'),
    },
  },
  test: {
    include: ['kernel/tests/**/*.test.ts', 'modules/*/tests/**/*.test.ts'],
    environment: 'node',
  },
})