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
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  provideTranslateService,
  TranslateLoader,
  TranslateService,
} from '@ngx-translate/core';
import { TranslateYamlHttpLoader } from './core/services/translate-yaml-http-loader.service';
import { provideEffects } from '@ngrx/effects';
import { provideStore, Store } from '@ngrx/store';
import { RoomsEffects } from './features/rooms/rooms.effects';
import { roomsReducer } from './features/rooms/rooms.reducer';
import { provideStoreDevtools } from '@ngrx/store-devtools';
import { authReducer } from './features/auth/auth.reducer';
import { AuthEffects } from './features/auth/auth.effects';
import { AuthActions } from './features/auth/auth.actions';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { VoiceRoomSocketToken } from './core/tokens/voice-room-socket.token';
import { io } from 'socket.io-client';
import { TextRoomSocketToken } from './core/tokens/text-room-socket.token';
import { localeInitializer } from './core/initializers/locale-initializer';
import { supportedLocales } from './app.constants';
import { NgDompurifySanitizer } from '@taiga-ui/dompurify';
import { environment } from '../environments/environment';
import { AUDIO_DEVICE_HANDLER } from './core/tokens/audio-device-handler.token';
import { VoiceRoomService } from './core/services/voice-room.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(withInterceptors([authInterceptor])),
    {
      provide: AUDIO_DEVICE_HANDLER,
      useExisting: VoiceRoomService,
    },
    provideTranslateService({
      loader: {
        provide: TranslateLoader,
        useClass: TranslateYamlHttpLoader,
      },
      fallbackLang: 'en',
    }),
    provideEffects(AuthEffects, RoomsEffects),
    provideStore({
      auth: authReducer,
      rooms: roomsReducer,
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
    provideTaiga(),
    {
      provide: Sanitizer,
      useClass: NgDompurifySanitizer,
    },
  ],
};
