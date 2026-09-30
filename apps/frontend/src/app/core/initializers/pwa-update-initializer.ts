import { inject } from '@angular/core';
import { PwaUpdateService } from '@core/services/pwa-update.service';

/**
 * Ensures PwaUpdateService is constructed at app boot (SwUpdate dialog).
 */
export const pwaUpdateInitializer = (): void => {
  inject(PwaUpdateService);
};
