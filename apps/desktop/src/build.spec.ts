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

  it('places host.css beside each dialog page', () => {
    for (const name of ['server', 'settings', 'picker', 'updater']) {
      const css = fs.readFileSync(
        path.resolve(distPagesDir, name, 'host.css'),
        'utf8',
      );
      expect(css).toContain('--tui-background-accent-1: #526ed3');
      expect(css).toContain('html,');
      expect(css).toContain('body {');

      const html = fs.readFileSync(
        path.resolve(distPagesDir, name, 'index.html'),
        'utf8',
      );
      expect(html).toContain('href="host.css"');
    }
  });
});
