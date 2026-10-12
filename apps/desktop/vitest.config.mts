import { defineConfig, type Plugin } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { transform } from 'esbuild';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function tc39DecoratorsPlugin(): Plugin {
  return {
    name: 'tc39-decorators',
    enforce: 'pre',
    async transform(code, id) {
      if (id.includes('node_modules')) return null;
      if (!/\.[cm]?[jt]sx?$/.test(id)) return null;
      if (!code.includes('@')) return null;
      const result = await transform(code, {
        loader: id.endsWith('.tsx') ? 'tsx' : 'ts',
        target: 'es2022',
        sourcemap: true,
        sourcefile: id,
        tsconfigRaw: {
          compilerOptions: {
            experimentalDecorators: false,
            useDefineForClassFields: true,
          },
        },
      });
      return {
        code: result.code,
        map: result.map ? JSON.parse(result.map) : null,
      };
    },
  };
}

export default defineConfig({
  plugins: [tc39DecoratorsPlugin()],
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
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
        find: /^@konvoez\/ui-kit\/i18n-controller$/,
        replacement: path.resolve(
          __dirname,
          '../../libs/ui-kit/src/i18n-controller/i18n-controller.ts',
        ),
      },
      {
        find: /^@konvoez\/ui-kit\/(.+)$/,
        replacement: path.resolve(__dirname, '../../libs/ui-kit/src/$1/$1.ts'),
      },
      {
        find: /^@konvoez\/client-dialogs\/(.+)$/,
        replacement: path.resolve(
          __dirname,
          '../../libs/client-dialogs/src/$1/$1.ts',
        ),
      },
    ],
  },
});
