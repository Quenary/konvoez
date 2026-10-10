import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sharedIndexPath = path.resolve(
  __dirname,
  '../../libs/shared/src/index.ts',
);
const distDir = path.resolve(__dirname, 'dist');
const distPagesDir = path.resolve(distDir, 'pages');

async function build() {
  const isDev = process.argv.includes('--dev');
  console.log(
    `[Desktop Build] Starting build (mode: ${isDev ? 'development' : 'production'})...`,
  );

  // 1. Ensure output directories exist
  fs.mkdirSync(distDir, { recursive: true });
  fs.mkdirSync(path.resolve(distDir, 'preload'), { recursive: true });
  fs.mkdirSync(distPagesDir, { recursive: true });

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
    alias: {
      '@konvoez/shared': sharedIndexPath,
    },
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
    alias: {
      '@konvoez/shared': sharedIndexPath,
    },
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
    alias: {
      '@konvoez/shared': sharedIndexPath,
    },
  });

  // 5. Copy Static Page Assets
  console.log('[Desktop Build] Copying static assets (HTML & CSS)...');
  const pagesSourceDir = path.resolve(__dirname, 'src/pages');
  const staticFiles = [
    'pages.css',
    'server.html',
    'settings.html',
    'picker.html',
  ];

  for (const file of staticFiles) {
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
