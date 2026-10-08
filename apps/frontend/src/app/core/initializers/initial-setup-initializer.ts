import { inject } from '@angular/core';
import { InitialSetupService } from '@core/services/initial-setup.service';

/**
 * Ensures InitialSetupService is constructed at app boot (auth-gated dialog).
 */
export const initialSetupInitializer = (): void => {
  inject(InitialSetupService);
};
