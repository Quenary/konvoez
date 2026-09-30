import { DestroyRef, inject, Injectable } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { TranslateService } from '@ngx-translate/core';
import { TuiResponsiveDialogService } from '@taiga-ui/addon-mobile';
import { TUI_CONFIRM, type TuiConfirmData } from '@taiga-ui/kit';
import { delay, filter, take } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class PwaUpdateService {
  private readonly swUpdate = inject(SwUpdate);
  private readonly tuiResponsiveDialogService = inject(
    TuiResponsiveDialogService,
  );
  private readonly translateService = inject(TranslateService);
  private readonly destroyRef = inject(DestroyRef);

  private dialogOpen = false;

  constructor() {
    if (!this.swUpdate.isEnabled) {
      return;
    }

    this.swUpdate.versionUpdates
      .pipe(
        filter(
          (event): event is VersionReadyEvent => event.type === 'VERSION_READY',
        ),
        delay(1000),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => {
        this.openUpdateDialog();
      });
  }

  private openUpdateDialog(): void {
    if (this.dialogOpen) {
      return;
    }

    this.dialogOpen = true;

    this.tuiResponsiveDialogService
      .open<boolean>(TUI_CONFIRM, {
        label: this.translateService.instant('PWA.UPDATE.TITLE'),
        size: 's',
        closable: false,
        dismissible: false,
        required: true,
        data: {
          content: this.translateService.instant('PWA.UPDATE.CONTENT'),
          yes: this.translateService.instant('PWA.UPDATE.ACTION'),
          no: this.translateService.instant('GENERAL.CANCEL'),
        } satisfies TuiConfirmData,
      })
      .pipe(take(1))
      .subscribe({
        next: (shouldUpdate) => {
          this.dialogOpen = false;
          if (shouldUpdate) {
            this.applyAvailableUpdate();
          }
        },
        error: () => {
          this.dialogOpen = false;
        },
        complete: () => {
          this.dialogOpen = false;
        },
      });
  }

  private applyAvailableUpdate(): void {
    document.location.reload();
  }
}
