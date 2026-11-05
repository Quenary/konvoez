import type { IKonvoezLocalBridge } from '@konvoez/client-shell';
import type { KSettingsDialog } from './k-settings-dialog';
import './k-settings-dialog';
import { mountDialog } from '../mount';

declare global {
  interface Window {
    konvoezLocal: IKonvoezLocalBridge;
  }
}

async function initSettingsPage(): Promise<void> {
  const el = await mountDialog<KSettingsDialog>(
    'k-settings-dialog',
    window.konvoezLocal.settings,
  );
  el.addEventListener('k-saved', () => {
    // settings saved
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    void initSettingsPage();
  });
} else {
  void initSettingsPage();
}
