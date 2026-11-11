import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';

const desktopDir = path.resolve(__dirname, '..');
const distPagesDir = path.resolve(desktopDir, 'dist/pages');

function collectFiles(dir: string, extension: string): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(fullPath, extension));
    } else if (entry.isFile() && entry.name.endsWith(extension)) {
      files.push(fullPath);
    }
  }
  return files;
}

describe('desktop build', () => {
  beforeAll(() => {
    execSync('node build.mjs', { cwd: desktopDir, stdio: 'pipe' });
  });

  it('generates dist/pages/*.js with no Node globals (process.*, require, __dirname)', () => {
    const files = collectFiles(distPagesDir, '.js');
    expect(files.length).toBeGreaterThan(0);

    const nodeGlobalsRegex = /\b(process\.|require\(|__dirname)/;
    for (const file of files) {
      const code = fs.readFileSync(file, 'utf8');
      expect(
        nodeGlobalsRegex.test(code),
        `${path.relative(distPagesDir, file)} should not contain Node globals`,
      ).toBe(false);
    }
  });

  it('ensures every HTML file has CSP meta and no inline script without src', () => {
    const files = collectFiles(distPagesDir, '.html');
    expect(files.length).toBeGreaterThan(0);

    const cspRegex = /<meta\s+[^>]*http-equiv=["']Content-Security-Policy["']/i;
    const inlineScriptRegex =
      /<script(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script>/gi;

    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      expect(
        cspRegex.test(content),
        `${path.relative(distPagesDir, file)} should contain Content-Security-Policy meta`,
      ).toBe(true);

      const inlineMatches = [...content.matchAll(inlineScriptRegex)];
      const nonEmptyInline = inlineMatches.filter(
        (m) => m[1].trim().length > 0,
      );
      expect(
        nonEmptyInline,
        `${path.relative(distPagesDir, file)} should have no inline scripts`,
      ).toHaveLength(0);
    }
  });

  it('places styles.css in pages directory with Taiga theme variables', () => {
    const cssPath = path.resolve(distPagesDir, 'styles.css');
    expect(
      fs.existsSync(cssPath),
      'styles.css should exist in dist/pages',
    ).toBe(true);
    const css = fs.readFileSync(cssPath, 'utf8');
    expect(css).toContain('--tui-background-accent-1: #526ed3');
    expect(css).toContain('--tui-typography-family-text: system-ui');
    expect(css).toContain('html');
    expect(css).toContain('body');
    expect(css).toMatch(/\[tuiTheme=(['"]?)dark\1\]/);
    expect(css).toMatch(/color-scheme:\s*dark/);
    expect(css).not.toMatch(/@font-face|url\(/);

    const htmlPath = path.resolve(distPagesDir, 'index.html');
    expect(
      fs.existsSync(htmlPath),
      'index.html should exist in dist/pages',
    ).toBe(true);
    const html = fs.readFileSync(htmlPath, 'utf8');
    expect(html).toContain('href="styles.css"');
    expect(html).toContain("connect-src 'none'");
    expect(
      fs.existsSync(
        path.resolve(distPagesDir, 'assets/taiga-ui/icons/check.svg'),
      ),
      'Taiga icon assets should be copied next to the dialog page',
    ).toBe(true);
  });

  it('does not ship the local bridge mock', () => {
    const files = collectFiles(distPagesDir, '.js');
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const code = fs.readFileSync(file, 'utf8');
      expect(
        code,
        `${path.relative(distPagesDir, file)} should not contain the local bridge mock`,
      ).not.toContain('desktop-ui-local-bridge-mock');
    }
  });

  it('places icon.ico and icon.png in dist/icons', () => {
    const distIconsDir = path.resolve(desktopDir, 'dist/icons');
    expect(fs.existsSync(path.join(distIconsDir, 'icon.ico'))).toBe(true);
    expect(fs.existsSync(path.join(distIconsDir, 'icon.png'))).toBe(true);
  });

  it('ensures desktop-ui component sources only reference inherited Taiga variables', () => {
    const desktopUiAppDir = path.resolve(desktopDir, '../desktop-ui/src/app');
    const localTokenRegex = /--tui-[a-z0-9-]+\s*:/;

    const files = [
      ...collectFiles(desktopUiAppDir, '.scss'),
      ...collectFiles(desktopUiAppDir, '.ts').filter(
        (f) => !f.endsWith('.spec.ts'),
      ),
    ];
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const source = fs.readFileSync(file, 'utf8');
      expect(
        localTokenRegex.test(source),
        `${path.relative(desktopUiAppDir, file)} should not define local --tui-* tokens`,
      ).toBe(false);
    }
  });
});
