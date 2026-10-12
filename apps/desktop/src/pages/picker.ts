import '@konvoez/client-dialogs/k-source-picker-dialog';
import type { KSourcePickerDialog } from '@konvoez/client-dialogs/k-source-picker-dialog';
import type { IKonvoezLocalBridge } from '@konvoez/client-shell';
import { mountDialog } from './mount';

declare global {
  interface Window {
    konvoezLocal: IKonvoezLocalBridge;
  }
}

async function initPickerPage(): Promise<void> {
  await mountDialog<KSourcePickerDialog>(
    'k-source-picker-dialog',
    window.konvoezLocal.picker,
    async () => {
      const initial = await window.konvoezLocal.picker.getInitial();
      return initial.locale;
    },
  );
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    void initPickerPage();
  });
} else {
  void initPickerPage();
}
