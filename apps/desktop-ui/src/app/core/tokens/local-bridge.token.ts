import { InjectionToken } from '@angular/core';
import type { IKonvoezLocalBridge } from '@konvoez/client-shell';

export const KONVOEZ_LOCAL_BRIDGE = new InjectionToken<IKonvoezLocalBridge>(
  'KONVOEZ_LOCAL_BRIDGE',
  {
    providedIn: 'root',
    factory: () => {
      const bridge = (
        window as unknown as { konvoezLocal?: IKonvoezLocalBridge }
      ).konvoezLocal;
      if (!bridge) {
        throw new Error('window.konvoezLocal bridge is not available');
      }
      return bridge;
    },
  },
);
