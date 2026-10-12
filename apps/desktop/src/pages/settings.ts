import '@konvoez/client-dialogs/k-settings-dialog';
import type { KSettingsDialog } from '@konvoez/client-dialogs/k-settings-dialog';
import type { IKonvoezLocalBridge } from '@konvoez/client-shell';
import { mountDialog } from './mount';

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
