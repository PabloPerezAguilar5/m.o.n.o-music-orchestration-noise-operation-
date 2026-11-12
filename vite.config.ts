import { defineConfig } from 'vitest/config';

export default defineConfig({
  // reference/ holds old repos with their own index.html; keep Vite from scanning or watching them.
  optimizeDeps: { entries: ['index.html'] },
  server: { watch: { ignored: ['**/reference/**'] } },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
