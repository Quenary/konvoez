import type { IKonvoezLocalBridge } from '@konvoez/client-shell';
import type { KSourcePickerDialog } from './k-source-picker-dialog';
import './k-source-picker-dialog';
import { mountDialog } from '../mount';

declare global {
  interface Window {
    konvoezLocal: IKonvoezLocalBridge;
  }
}

async function initPickerPage(): Promise<void> {
  await mountDialog<KSourcePickerDialog>(
    'k-source-picker-dialog',
    window.konvoezLocal.picker,
  );
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    void initPickerPage();
  });
} else {
  void initPickerPage();
}
