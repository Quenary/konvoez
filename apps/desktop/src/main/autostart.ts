import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { app } from 'electron';

export function generateLinuxDesktopEntry(execPath: string): string {
  return `[Desktop Entry]
Type=Application
Name=Konvoez
Exec="${execPath}" --hidden
Icon=konvoez
Terminal=false
Categories=Network;
`;
}

export function setAutostart(
  enabled: boolean,
  platform: NodeJS.Platform = process.platform,
): void {
  if (platform === 'win32') {
    app.setLoginItemSettings({
      openAtLogin: enabled,
      args: ['--hidden'],
    });
    return;
  }

  if (platform === 'linux') {
    const autostartDir = path.join(os.homedir(), '.config', 'autostart');
    const desktopFile = path.join(autostartDir, 'konvoez.desktop');

    if (enabled) {
      const execPath = process.env.APPIMAGE ?? process.execPath;
      const content = generateLinuxDesktopEntry(execPath);
      try {
        if (!fs.existsSync(autostartDir)) {
          fs.mkdirSync(autostartDir, { recursive: true });
        }
        fs.writeFileSync(desktopFile, content, 'utf-8');
      } catch (err) {
        console.warn('[Autostart] Failed to write Linux desktop file:', err);
      }
    } else {
      try {
        if (fs.existsSync(desktopFile)) {
          fs.unlinkSync(desktopFile);
        }
      } catch (err) {
        console.warn('[Autostart] Failed to remove Linux desktop file:', err);
      }
    }
  }
}
