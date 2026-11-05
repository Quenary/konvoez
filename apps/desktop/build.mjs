import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { compileTheme } from './tools/compile-theme.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sharedIndexPath = path.resolve(
  __dirname,
  '../../libs/shared/src/index.ts',
);
const clientShellIndexPath = path.resolve(
  __dirname,
  '../../libs/client-shell/src/index.ts',
);
const distDir = path.resolve(__dirname, 'dist');
const distPagesDir = path.resolve(distDir, 'pages');

const libAliases = {
  '@konvoez/shared': sharedIndexPath,
  '@konvoez/client-shell': clientShellIndexPath,
};

const subpathAliasPlugin = {
  name: 'subpath-alias',
  setup(build) {
    build.onResolve({ filter: /^@konvoez\/ui-kit\/(.+)$/ }, (args) => {
      const match = args.path.match(/^@konvoez\/ui-kit\/(.+)$/);
      if (!match) return null;
      const subpath = match[1];
      if (subpath === 'i18n-controller') {
        return {
          path: path.resolve(
            __dirname,
            '../../libs/ui-kit/src/i18n-controller/i18n-controller.ts',
          ),
        };
      }
      return {
        path: path.resolve(
          __dirname,
          `../../libs/ui-kit/src/${subpath}/${subpath}.ts`,
        ),
      };
    });
  },
};

async function build() {
  const isDev = process.argv.includes('--dev');
  console.log(
    `[Desktop Build] Starting build (mode: ${isDev ? 'development' : 'production'})...`,
  );

  // 1. Ensure output directories exist
  fs.mkdirSync(distDir, { recursive: true });
  fs.mkdirSync(path.resolve(distDir, 'preload'), { recursive: true });
  fs.rmSync(distPagesDir, { recursive: true, force: true });
  fs.mkdirSync(distPagesDir, { recursive: true });
  const iconsDistDir = path.resolve(distDir, 'icons');

  console.log('[Desktop Build] Copying icons...');
  fs.mkdirSync(iconsDistDir, { recursive: true });
  const iconsSourceDir = path.resolve(__dirname, 'build/icons');
  for (const iconFile of ['icon.ico', 'icon.png']) {
    const src = path.resolve(iconsSourceDir, iconFile);
    const dest = path.resolve(iconsDistDir, iconFile);
    if (!fs.existsSync(src)) {
      throw new Error(`[Desktop Build] Missing icon source: ${src}`);
    }
    fs.copyFileSync(src, dest);
  }

  // Copy native addons if built
  const nativeDistDir = path.resolve(distDir, 'native');
  fs.mkdirSync(nativeDistDir, { recursive: true });
  const rootNativeDist = path.resolve(__dirname, '../../dist/native');
  const libNativeDir = path.resolve(__dirname, '../../libs/desktop-native');
  for (const searchDir of [rootNativeDist, libNativeDir]) {
    if (fs.existsSync(searchDir)) {
      for (const file of fs.readdirSync(searchDir)) {
        if (file.endsWith('.node')) {
          const src = path.resolve(searchDir, file);
          const dest = path.resolve(nativeDistDir, file);
          fs.copyFileSync(src, dest);
          console.log(`[Desktop Build] Copied native addon: ${file}`);
        }
      }
    }
  }

  // 2. Build Main Process
  console.log('[Desktop Build] Bundling main process...');
  await esbuild.build({
    entryPoints: [path.resolve(__dirname, 'src/main/main.ts')],
    bundle: true,
    platform: 'node',
    target: 'node22',
    format: 'cjs',
    outfile: path.resolve(distDir, 'main.js'),
    external: ['electron', '*.node'],
    sourcemap: isDev,
    minify: !isDev,
    alias: libAliases,
    plugins: [subpathAliasPlugin],
  });

  // 3. Build Preload Scripts
  console.log('[Desktop Build] Bundling preload scripts...');
  await esbuild.build({
    entryPoints: [
      path.resolve(__dirname, 'src/preload/app-preload.ts'),
      path.resolve(__dirname, 'src/preload/local-preload.ts'),
    ],
    bundle: true,
    platform: 'node',
    target: 'node22',
    format: 'cjs',
    outdir: path.resolve(distDir, 'preload'),
    external: ['electron'],
    sourcemap: isDev,
    minify: !isDev,
    alias: libAliases,
    plugins: [subpathAliasPlugin],
  });

  // 4. Build Dialog Pages Scripts
  console.log('[Desktop Build] Bundling dialog pages scripts...');
  await esbuild.build({
    entryPoints: [
      path.resolve(__dirname, 'src/pages/server/main.ts'),
      path.resolve(__dirname, 'src/pages/settings/main.ts'),
      path.resolve(__dirname, 'src/pages/picker/main.ts'),
    ],
    bundle: true,
    platform: 'browser',
    target: 'chrome130',
    format: 'iife',
    outdir: distPagesDir,
    sourcemap: isDev,
    minify: !isDev,
    treeShaking: true,
    legalComments: 'none',
    conditions: ['production'],
    tsconfigRaw: {
      compilerOptions: {
        experimentalDecorators: false,
        useDefineForClassFields: true,
      },
    },
    alias: libAliases,
    plugins: [subpathAliasPlugin],
  });

  console.log('[Desktop Build] Verifying dialog pages have no Node globals...');
  const nodeGlobalsRegex = /\b(process\.|require\(|__dirname)/;
  const collectJsFiles = (dir) => {
    const files = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...collectJsFiles(fullPath));
      } else if (entry.isFile() && entry.name.endsWith('.js')) {
        files.push(fullPath);
      }
    }
    return files;
  };
  for (const file of collectJsFiles(distPagesDir)) {
    const code = fs.readFileSync(file, 'utf8');
    if (nodeGlobalsRegex.test(code)) {
      throw new Error(
        `[Desktop Build] ${path.relative(distPagesDir, file)} references Node globals (process.*, require, __dirname) — dialog pages must not use Node globals`,
      );
    }
  }

  // 5. Copy Static Page Assets
  console.log('[Desktop Build] Copying static assets (HTML & CSS)...');
  const pagesSourceDir = path.resolve(__dirname, 'src/pages');
  console.log('[Desktop Build] Compiling Taiga theme...');
  const hostCss = await compileTheme();

  for (const name of ['server', 'settings', 'picker']) {
    const src = path.resolve(pagesSourceDir, name, 'index.html');
    const destDir = path.resolve(distPagesDir, name);
    if (!fs.existsSync(src)) {
      throw new Error(`[Desktop Build] Missing page: ${src}`);
    }
    fs.mkdirSync(destDir, { recursive: true });
    fs.copyFileSync(src, path.resolve(destDir, 'index.html'));
    fs.writeFileSync(path.resolve(destDir, 'host.css'), hostCss, 'utf8');
  }

  // 6. Verify Preload Bundle Size
  const appPreloadBundle = path.resolve(distDir, 'preload/app-preload.js');
  if (fs.existsSync(appPreloadBundle)) {
    const stats = fs.statSync(appPreloadBundle);
    const sizeKb = (stats.size / 1024).toFixed(1);
    console.log(`[Desktop Build] app-preload.js size: ${sizeKb} KB`);
    if (stats.size > 200 * 1024) {
      console.warn(
        `[Desktop Build] WARNING: app-preload.js size (${sizeKb} KB) exceeds recommended 200 KB budget!`,
      );
    }
  }

  console.log('[Desktop Build] Build completed successfully.');
}

build().catch((err) => {
  console.error('[Desktop Build] Build failed:', err);
  process.exit(1);
});
