import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { getIconPath } from './assets';

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
