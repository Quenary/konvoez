import * as path from 'node:path';

export function getIconPath(
  platform: NodeJS.Platform = process.platform,
  baseDir = __dirname,
): string {
  return path.join(
    baseDir,
    'icons',
    platform === 'win32' ? 'icon.ico' : 'icon.png',
  );
}
