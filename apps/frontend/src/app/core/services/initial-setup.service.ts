import { DestroyRef, inject, Injectable, Injector } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { selectIsAuthorized } from '@core/auth/auth.selectors';
import { Store } from '@ngrx/store';
import { TranslateService } from '@ngx-translate/core';
import { TuiDialogService } from '@taiga-ui/core';
import { PolymorpheusComponent } from '@taiga-ui/polymorpheus';
import { take } from 'rxjs';
import { SettingsStore } from '@core/stores/settings.store';

@Injectable({ providedIn: 'root' })
export class InitialSetupService {
  private readonly store = inject(Store);
  private readonly settingsStore = inject(SettingsStore);
  private readonly dialogService = inject(TuiDialogService);
  private readonly translateService = inject(TranslateService);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);

  private dialogOpen = false;

  constructor() {
    this.store
      .select(selectIsAuthorized)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((isAuthorized) => {
        if (!isAuthorized) {
          this.dialogOpen = false;
          return;
        }

        void this.openIfNeeded();
      });
  }

  private async openIfNeeded(): Promise<void> {
    if (this.dialogOpen || !this.settingsStore.needsInitialSetup()) {
      return;
    }

    this.dialogOpen = true;

    try {
      const { InitialSetupDialogComponent } =
        await import('../../features/settings/initial-setup-dialog/initial-setup-dialog.component');

      this.dialogService
        .open<boolean>(
          new PolymorpheusComponent(InitialSetupDialogComponent, this.injector),
          {
            label: this.translateService.instant(
              'SETTINGS.INITIAL_SETUP.TITLE',
            ),
            size: 'm',
            closable: false,
            dismissible: false,
            required: true,
          },
        )
        .pipe(take(1))
        .subscribe({
          next: () => {
            this.dialogOpen = false;
            if (this.settingsStore.needsInitialSetup()) {
              void this.openIfNeeded();
            }
          },
          error: () => {
            this.dialogOpen = false;
            void this.openIfNeeded();
          },
        });
    } catch {
      this.dialogOpen = false;
    }
  }
}
