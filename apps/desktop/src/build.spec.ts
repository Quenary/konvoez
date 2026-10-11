import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';

const desktopDir = path.resolve(__dirname, '..');
const distPagesDir = path.resolve(desktopDir, 'dist/pages');

describe('desktop build', () => {
  beforeAll(() => {
    execSync('node build.mjs', { cwd: desktopDir, stdio: 'pipe' });
  });

  it('generates dist/pages/*.js with no Node globals (process.*, require, __dirname)', () => {
    const files = fs.readdirSync(distPagesDir).filter((f) => f.endsWith('.js'));
    expect(files.length).toBeGreaterThan(0);

    const nodeGlobalsRegex = /\b(process\.|require\(|__dirname)/;
    for (const file of files) {
      const code = fs.readFileSync(path.resolve(distPagesDir, file), 'utf8');
      expect(
        nodeGlobalsRegex.test(code),
        `${file} should not contain Node globals`,
      ).toBe(false);
    }
  });

  it('ensures every HTML file has CSP meta and no inline script without src', () => {
    const files = fs
      .readdirSync(distPagesDir)
      .filter((f) => f.endsWith('.html'));
    expect(files.length).toBeGreaterThan(0);

    const cspRegex = /<meta\s+[^>]*http-equiv=["']Content-Security-Policy["']/i;
    const inlineScriptRegex =
      /<script(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script>/gi;

    for (const file of files) {
      const content = fs.readFileSync(path.resolve(distPagesDir, file), 'utf8');
      expect(
        cspRegex.test(content),
        `${file} should contain Content-Security-Policy meta`,
      ).toBe(true);

      const inlineMatches = [...content.matchAll(inlineScriptRegex)];
      const nonEmptyInline = inlineMatches.filter(
        (m) => m[1].trim().length > 0,
      );
      expect(
        nonEmptyInline,
        `${file} should have no inline scripts`,
      ).toHaveLength(0);
    }
  });

  it('ensures dist/pages/host.css exists', () => {
    const hostCssPath = path.resolve(distPagesDir, 'host.css');
    expect(fs.existsSync(hostCssPath)).toBe(true);
  });
});
