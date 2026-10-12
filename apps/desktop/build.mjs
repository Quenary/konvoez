import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import * as esbuild from 'esbuild';

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
    build.onResolve(
      { filter: /^@konvoez\/(ui-kit|client-dialogs)\/(.+)$/ },
      (args) => {
        const match = args.path.match(
          /^@konvoez\/(ui-kit|client-dialogs)\/(.+)$/,
        );
        if (!match) return null;
        const [, lib, subpath] = match;
        if (lib === 'ui-kit' && subpath === 'theme') {
          return {
            path: path.resolve(
              __dirname,
              '../../libs/ui-kit/src/theme/tokens.ts',
            ),
          };
        }
        if (lib === 'ui-kit' && subpath === 'i18n-controller') {
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
            `../../libs/${lib}/src/${subpath}/${subpath}.ts`,
          ),
        };
      },
    );
  },
};

async function build() {
  const isDev = process.argv.includes('--dev');
  console.log(
    `[Desktop Build] Starting build (mode: ${isDev ? 'development' : 'production'})...`,
  );

  console.log('[Desktop Build] Generating ui-kit theme tokens...');
  execSync('node ../../libs/ui-kit/scripts/generate-tokens.mjs', {
    cwd: __dirname,
    stdio: 'inherit',
  });

  const uiKitThemeDir = path.resolve(__dirname, '../../libs/ui-kit/src/theme');

  // 1. Ensure output directories exist
  fs.mkdirSync(distDir, { recursive: true });
  fs.mkdirSync(path.resolve(distDir, 'preload'), { recursive: true });
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

  // 2. Build Main Process
  console.log('[Desktop Build] Bundling main process...');
  await esbuild.build({
    entryPoints: [path.resolve(__dirname, 'src/main/main.ts')],
    bundle: true,
    platform: 'node',
    target: 'node22',
    format: 'cjs',
    outfile: path.resolve(distDir, 'main.js'),
    external: ['electron'],
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
      path.resolve(__dirname, 'src/pages/server.ts'),
      path.resolve(__dirname, 'src/pages/settings.ts'),
      path.resolve(__dirname, 'src/pages/picker.ts'),
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
  for (const file of fs.readdirSync(distPagesDir)) {
    if (!file.endsWith('.js')) {
      continue;
    }
    const code = fs.readFileSync(path.resolve(distPagesDir, file), 'utf8');
    if (nodeGlobalsRegex.test(code)) {
      throw new Error(
        `[Desktop Build] ${file} references Node globals (process.*, require, __dirname) — dialog pages must not use Node globals`,
      );
    }
  }

  // 5. Copy Static Page Assets
  console.log('[Desktop Build] Copying static assets (HTML & CSS)...');
  const pagesSourceDir = path.resolve(__dirname, 'src/pages');
  const hostCss = [
    fs.readFileSync(
      path.resolve(uiKitThemeDir, 'generated/root-tokens.css'),
      'utf8',
    ),
    fs.readFileSync(path.resolve(uiKitThemeDir, 'host-base.css'), 'utf8'),
  ].join('\n\n');
  fs.writeFileSync(path.resolve(distPagesDir, 'host.css'), hostCss, 'utf8');

  for (const file of ['server.html', 'settings.html', 'picker.html']) {
    const src = path.resolve(pagesSourceDir, file);
    const dest = path.resolve(distPagesDir, file);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dest);
    } else {
      console.warn(`[Desktop Build] Warning: ${src} not found`);
    }
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
