import { defineConfig, type Plugin } from 'vitest/config';
import os from 'node:os';
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
    // Electron 44 has no postinstall. Requiring the package downloads the
    // binary, and parallel workers race on that extract (`File exists`).
    // These tests never execute the binary.
    env: {
      ELECTRON_OVERRIDE_DIST_PATH: path.join(
        os.tmpdir(),
        'konvoez-electron-stub',
      ),
    },
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
    ],
  },
});
