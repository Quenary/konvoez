import {
  ApplicationConfig,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideRouter, withHashLocation } from '@angular/router';
import { provideTaiga } from '@taiga-ui/core';
import { routes } from './app.routes';
import { KONVOEZ_LOCAL_BRIDGE } from './core/tokens/local-bridge.token';
import type { IKonvoezLocalBridge } from '@konvoez/client-shell';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideRouter(routes, withHashLocation()),
    provideTaiga(),
    {
      provide: KONVOEZ_LOCAL_BRIDGE,
      useFactory: () => {
        const bridge = (
          window as unknown as { konvoezLocal?: IKonvoezLocalBridge }
        ).konvoezLocal;
        if (!bridge) {
          throw new Error('window.konvoezLocal bridge is not available');
        }
        return bridge;
      },
    },
  ],
};
