import { describe, expect, it } from 'vitest';
import { compileTheme } from '../../tools/compile-theme.mjs';

describe('compileTheme', () => {
  it('produces Taiga root variables without external assets', async () => {
    const css = await compileTheme();

    for (const needle of [
      '--tui-background-base:',
      '--tui-text-primary:',
      '--tui-background-accent-1:',
      '--tui-radius-m:',
      '--tui-height-m:',
      '--tui-typography-family-text: system-ui',
    ]) {
      expect(css).toContain(needle);
    }

    expect(css).toMatch(
      /@media\s+screen\s+and\s+\(prefers-color-scheme:\s*dark\)[\s\S]*--tui-background-base:/,
    );

    expect(css).not.toMatch(/@font-face|url\(|@import/);
  });
});
