import { provideTaiga } from '@taiga-ui/core';
import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
  isDevMode,
  LOCALE_ID,
  Sanitizer,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import {
  provideHttpClient,
  withInterceptors,
  withXhr,
} from '@angular/common/http';
import {
  provideTranslateService,
  TranslateLoader,
  TranslateService,
} from '@ngx-translate/core';
import { TranslateYamlHttpLoader } from './core/services/translate-yaml-http-loader.service';
import { provideEffects } from '@ngrx/effects';
import { provideStore, Store } from '@ngrx/store';
import { provideStoreDevtools } from '@ngrx/store-devtools';
import { authReducer } from './core/auth/auth.reducer';
import { AuthEffects } from './core/auth/auth.effects';
import { AuthActions } from './core/auth/auth.actions';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { VoiceRoomSocketToken } from './core/tokens/voice-room-socket.token';
import { io } from 'socket.io-client';
import { TextRoomSocketToken } from './core/tokens/text-room-socket.token';
import { EntitySyncSocketToken } from './core/tokens/entity-sync-socket.token';
import { EntitySyncService } from './core/services/entity-sync.service';
import { initialSetupInitializer } from './core/initializers/initial-setup-initializer';
import { localeInitializer } from './core/initializers/locale-initializer';
import { pwaUpdateInitializer } from './core/initializers/pwa-update-initializer';
import { TextRoomSocketConnectionService } from './core/services/text-room-socket-connection.service';
import { DesktopBridgeService } from './core/desktop/desktop-bridge.service';
import { supportedLocales } from './app.constants';
import { NgDompurifySanitizer } from '@taiga-ui/dompurify';
import { environment } from '../environments/environment';
import { AUDIO_DEVICE_HANDLER } from './core/tokens/audio-device-handler.token';
import { VoiceSessionService } from './core/services/voice-session.service';
import { provideServiceWorker } from '@angular/service-worker';

// Fetch throws if upload progress is requested. XHR is what reports it.
export function provideAppHttpClient() {
  return provideHttpClient(withInterceptors([authInterceptor]), withXhr());
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideAppHttpClient(),
    {
      provide: AUDIO_DEVICE_HANDLER,
      useExisting: VoiceSessionService,
    },
    provideTranslateService({
      loader: {
        provide: TranslateLoader,
        useClass: TranslateYamlHttpLoader,
      },
      fallbackLang: 'en',
    }),
    provideEffects(AuthEffects),
    provideStore({
      auth: authReducer,
    }),
    provideStoreDevtools({ maxAge: 25, logOnly: !isDevMode() }),
    {
      provide: VoiceRoomSocketToken,
      useValue: io(window.location.origin, {
        autoConnect: false,
        path: `${environment.wsPath}/voice`,
      }),
    },
    {
      provide: TextRoomSocketToken,
      useValue: io(window.location.origin, {
        autoConnect: false,
        path: `${environment.wsPath}/text`,
      }),
    },
    {
      provide: EntitySyncSocketToken,
      useValue: io(window.location.origin, {
        autoConnect: false,
        path: `${environment.wsPath}/sync`,
      }),
    },
    {
      provide: LOCALE_ID,
      useFactory: () => {
        const locale = navigator.language
          ? navigator.language.split('-')[0]
          : 'en';
        return supportedLocales.find((l) => l === locale) || 'en';
      },
    },

    // Initializers
    provideAppInitializer(() => {
      const translateService = inject(TranslateService);
      return translateService.use(translateService.getBrowserLang() || 'en');
    }),
    provideAppInitializer(() => {
      const store = inject(Store);
      return store.dispatch(AuthActions.initStart());
    }),
    provideAppInitializer(() => localeInitializer()),
    provideAppInitializer(() => initialSetupInitializer()),
    provideAppInitializer(() => pwaUpdateInitializer()),
    provideAppInitializer(() => {
      inject(TextRoomSocketConnectionService);
    }),
    provideAppInitializer(() => {
      inject(EntitySyncService);
    }),
    provideAppInitializer(() => {
      inject(DesktopBridgeService).init();
    }),
    provideTaiga(),
    {
      provide: Sanitizer,
      useClass: NgDompurifySanitizer,
    },
    provideServiceWorker('ngsw-worker.js', {
      enabled: environment.enableServiceWorker,
      registrationStrategy: environment.enableServiceWorker
        ? 'registerImmediately'
        : 'registerWhenStable:30000',
    }),
  ],
};
