import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
  isDevMode,
  LOCALE_ID,
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
import { providePrimeNG } from 'primeng/config';
import Aura from '@primeuix/themes/aura';
import { provideEffects } from '@ngrx/effects';
import { provideStore, Store } from '@ngrx/store';
import { RoomsEffects } from './features/rooms/rooms.effects';
import { roomsReducer } from './features/rooms/rooms.reducer';
import { provideStoreDevtools } from '@ngrx/store-devtools';
import { authReducer } from './features/auth/auth.reducer';
import { AuthEffects } from './features/auth/auth.effects';
import { AuthActions } from './features/auth/auth.actions';
import { MessageService } from 'primeng/api';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { voiceRoomReducer } from './features/voice-room/voice-room.reducer';
import { VoiceRoomEffects } from './features/voice-room/voice-room.effects';
import { settingsReducer } from './features/settings/settings.reducer';
import { SettingsEffects } from './features/settings/settings.effects';
import { EStorageKey } from './app.enums';
import { SettingsActions } from './features/settings/settings.actions';
import { VoiceRoomSocketToken } from './core/tokens/voice-room-socket.token';
import { io } from 'socket.io-client';
import { TextRoomSocketToken } from './core/tokens/text-room-socket.token';
import { TextRoomEffects } from './features/text-room/text-room.effects';
import { textRoomReducer } from './features/text-room/text-room.reducer';
import { localeInitializer } from './core/initializers/locale-initializer';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(withInterceptors([authInterceptor])),
    provideTranslateService({
      loader: {
        provide: TranslateLoader,
        useClass: TranslateYamlHttpLoader,
      },
      fallbackLang: 'en',
    }),
    providePrimeNG({
      theme: {
        preset: Aura,
      },
    }),
    provideEffects(
      AuthEffects,
      RoomsEffects,
      TextRoomEffects,
      VoiceRoomEffects,
      SettingsEffects,
    ),
    provideStore({
      auth: authReducer,
      rooms: roomsReducer,
      textRoom: textRoomReducer,
      voiceRoom: voiceRoomReducer,
      settings: settingsReducer,
    }),
    provideStoreDevtools({ maxAge: 25, logOnly: !isDevMode() }),
    MessageService,
    {
      provide: VoiceRoomSocketToken,
      useValue: io(window.location.origin, {
        autoConnect: false,
        path: '/api/voice',
      }),
    },
    {
      provide: TextRoomSocketToken,
      useValue: io(window.location.origin, {
        autoConnect: false,
        path: '/api/text',
      }),
    },
    {
      provide: LOCALE_ID,
      useFactory: () => {
        const locale = navigator.language || 'en-US';
        return locale;
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
    provideAppInitializer(() => {
      const store = inject(Store);
      const audioInput = localStorage.getItemJson<MediaDeviceInfo>(
        EStorageKey.AUDIO_INPUT,
      );
      const audioOutput = localStorage.getItemJson<MediaDeviceInfo>(
        EStorageKey.AUDIO_OUTPUT,
      );
      store.dispatch(
        SettingsActions.init({
          audioInput,
          audioOutput,
        }),
      );
    }),
    provideAppInitializer(() => localeInitializer()),
  ],
};
