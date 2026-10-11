import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { getIconPath } from './assets';

const specDir = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(specDir, '../..');
const distIconsDir = path.resolve(desktopRoot, 'dist/icons');

describe('getIconPath', () => {
  it('resolves Windows icon under baseDir', () => {
    expect(getIconPath('win32', '/x/dist')).toBe(
      path.join('/x/dist', 'icons', 'icon.ico'),
    );
  });

  it('resolves Linux icon under baseDir', () => {
    expect(getIconPath('linux', '/x/dist')).toBe(
      path.join('/x/dist', 'icons', 'icon.png'),
    );
  });
});

describe('desktop build copies icons into dist', () => {
  beforeAll(() => {
    execSync('node build.mjs', { cwd: desktopRoot, stdio: 'pipe' });
  });

  it('places icon.ico and icon.png in dist/icons', () => {
    expect(fs.existsSync(path.join(distIconsDir, 'icon.ico'))).toBe(true);
    expect(fs.existsSync(path.join(distIconsDir, 'icon.png'))).toBe(true);
  });
});
