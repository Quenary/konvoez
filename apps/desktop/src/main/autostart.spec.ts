import { describe, expect, it } from 'vitest';
import { generateLinuxDesktopEntry } from './autostart';

describe('generateLinuxDesktopEntry', () => {
  it('generates desktop entry with Exec path and --hidden flag', () => {
    const entry = generateLinuxDesktopEntry('/opt/Konvoez.AppImage');
    expect(entry).toContain('Type=Application');
    expect(entry).toContain('Name=Konvoez');
    expect(entry).toContain('Exec="/opt/Konvoez.AppImage" --hidden');
    expect(entry).toContain('Categories=Network;');
  });
});
