import {
  ApplicationConfig,
  InjectionToken,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideRouter, withHashLocation } from '@angular/router';
import type { IKonvoezLocalBridge } from '@konvoez/client-shell';
import { provideTaiga } from '@taiga-ui/core';
import { routes } from './app.routes';
import { readLocalBridge } from './core/local-bridge';

export const KONVOEZ_LOCAL_BRIDGE = new InjectionToken<IKonvoezLocalBridge>(
  'KONVOEZ_LOCAL_BRIDGE',
);

export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideRouter(routes, withHashLocation()),
    provideTaiga(),
    {
      provide: KONVOEZ_LOCAL_BRIDGE,
      useFactory: readLocalBridge,
    },
  ],
};
