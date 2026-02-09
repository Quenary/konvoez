import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
  isDevMode,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { provideHttpClient } from '@angular/common/http';
import { provideTranslateService, TranslateLoader, TranslateService } from '@ngx-translate/core';
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

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(),
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
    provideEffects(AuthEffects, RoomsEffects),
    provideStore({
      auth: authReducer,
      rooms: roomsReducer,
    }),
    provideStoreDevtools({ maxAge: 25, logOnly: !isDevMode() }),
    // Initializers
    provideAppInitializer(() => {
      const translateService = inject(TranslateService);
      return translateService.use(translateService.getBrowserLang() || 'en');
    }),
    provideAppInitializer(() => {
      const store = inject(Store);
      return store.dispatch(AuthActions.initStart());
    }),
  ],
};
