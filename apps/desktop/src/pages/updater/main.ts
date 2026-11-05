import type { IKonvoezLocalBridge } from '@konvoez/client-shell';
import type { KUpdaterDialog } from './k-updater-dialog';
import './k-updater-dialog';
import { mountDialog } from '../mount';

declare global {
  interface Window {
    konvoezLocal: IKonvoezLocalBridge;
  }
}

async function initUpdaterPage(): Promise<void> {
  await mountDialog<KUpdaterDialog>(
    'k-updater-dialog',
    window.konvoezLocal.updater,
  );
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    void initUpdaterPage();
  });
} else {
  void initUpdaterPage();
}
