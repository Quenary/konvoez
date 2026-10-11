import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.spec.ts'],
    passWithNoTests: true,
  },
  resolve: {
    alias: [
      {
        find: '@konvoez/shared',
        replacement: path.resolve(__dirname, '../../libs/shared/src/index.ts'),
      },
      {
        find: '@konvoez/client-shell',
        replacement: path.resolve(
          __dirname,
          '../../libs/client-shell/src/index.ts',
        ),
      },
      {
        find: /^@konvoez\/ui-kit\/theme$/,
        replacement: path.resolve(__dirname, 'src/theme/tokens.ts'),
      },
      {
        find: /^@konvoez\/ui-kit\/i18n-controller$/,
        replacement: path.resolve(
          __dirname,
          'src/i18n-controller/i18n-controller.ts',
        ),
      },
      {
        find: /^@konvoez\/ui-kit\/(.+)$/,
        replacement: path.resolve(__dirname, 'src/$1/$1.ts'),
      },
    ],
  },
});
