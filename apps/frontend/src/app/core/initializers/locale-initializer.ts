import { LOCATION_INITIALIZED } from '@angular/common';
import { inject, EnvironmentInjector } from '@angular/core';
import { readLocalSettings } from '@core/stores/local-settings.storage';
import { LocaleService, resolveLanguage } from '@core/services/locale.service';

export const localeInitializer = async () => {
  const environmentInjector = inject(EnvironmentInjector);
  const localeService = inject(LocaleService);
  const locationInitialized = environmentInjector.get(
    LOCATION_INITIALIZED,
    Promise.resolve(null),
  );
  await locationInitialized;
  const stored = readLocalSettings().language;
  await localeService.apply(resolveLanguage(stored));
};
