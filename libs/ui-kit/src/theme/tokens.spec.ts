import { describe, expect, it } from 'vitest';
import { tokens } from './tokens';

describe('theme tokens', () => {
  const REQUIRED_TOKENS = [
    '--tui-background-base',
    '--tui-background-base-alt',
    '--tui-background-elevation-1',
    '--tui-background-neutral-1',
    '--tui-background-neutral-1-hover',
    '--tui-background-accent-1',
    '--tui-background-accent-1-hover',
    '--tui-text-primary',
    '--tui-text-secondary',
    '--tui-text-tertiary',
    '--tui-text-primary-on-accent-1',
    '--tui-text-action',
    '--tui-text-negative',
    '--tui-text-positive',
    '--tui-status-negative',
    '--tui-border-normal',
    '--tui-border-focus',
  ];

  it('contains every token in both light and dark blocks', () => {
    const cssText = tokens.cssText;
    const darkBlockIndex = cssText.indexOf(
      '@media (prefers-color-scheme: dark)',
    );
    expect(darkBlockIndex).toBeGreaterThan(-1);

    const lightCss = cssText.slice(0, darkBlockIndex);
    const darkCss = cssText.slice(darkBlockIndex);

    for (const token of REQUIRED_TOKENS) {
      expect(lightCss, `Light block missing ${token}`).toContain(`${token}:`);
      expect(darkCss, `Dark block missing ${token}`).toContain(`${token}:`);
    }
  });

  it('contains shape tokens', () => {
    const cssText = tokens.cssText;
    expect(cssText).toContain('--tui-radius-m:');
    expect(cssText).toContain('--tui-radius-l:');
    expect(cssText).toContain('--tui-height-m:');
    expect(cssText).toContain('--tui-font-text:');
  });
});
