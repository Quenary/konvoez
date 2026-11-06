import type { IKonvoezLocalBridge } from '@konvoez/client-shell';
import type { KServerDialog } from './k-server-dialog';
import './k-server-dialog';
import { mountDialog } from '../mount';

declare global {
  interface Window {
    konvoezLocal: IKonvoezLocalBridge;
  }
}

async function initServerPage(): Promise<void> {
  const el = await mountDialog<KServerDialog>(
    'k-server-dialog',
    window.konvoezLocal.server,
  );
  el.addEventListener('k-done', () => {
    // main closes the window after save (existing behaviour)
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    void initServerPage();
  });
} else {
  void initServerPage();
}
