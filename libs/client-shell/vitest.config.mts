import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    passWithNoTests: true,
  },
  resolve: {
    alias: {
      '@konvoez/shared': path.resolve(
        __dirname,
        '../../libs/shared/src/index.ts',
      ),
      '@konvoez/client-shell': path.resolve(
        __dirname,
        'src/index.ts',
      ),
    },
  },
});
