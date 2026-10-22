import {
  ChangeDetectionStrategy,
  Component,
  inject,
  Injector,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { IRole } from '@konvoez/shared';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { TuiTable } from '@taiga-ui/addon-table';
import { TuiButton, TuiNotificationService, TuiTitle } from '@taiga-ui/core';
import { TuiBadge } from '@taiga-ui/kit';
import { TuiCardLarge, TuiHeader } from '@taiga-ui/layout';
import { PolymorpheusComponent } from '@taiga-ui/polymorpheus';
import { TUI_CONFIRM, TuiConfirmData } from '@taiga-ui/kit';
import { TuiResponsiveDialogService } from '@taiga-ui/addon-mobile';
import { catchError, finalize, of } from 'rxjs';
import { RolesApiService } from '@core/api/roles-api.service';
import { ApiErrorService } from '@core/services/api-error.service';

@Component({
  selector: 'app-settings-roles',
  imports: [
    TranslatePipe,
    TuiBadge,
    TuiButton,
    TuiCardLarge,
    TuiHeader,
    TuiTable,
    TuiTitle,
  ],
  templateUrl: './settings-roles.component.html',
  styleUrl: './settings-roles.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsRolesComponent {
  private readonly rolesApiService = inject(RolesApiService);
  private readonly responsiveDialogService = inject(TuiResponsiveDialogService);
  private readonly translateService = inject(TranslateService);
  private readonly notificationService = inject(TuiNotificationService);
  private readonly apiErrorService = inject(ApiErrorService);
  private readonly injector = inject(Injector);

  protected readonly rolesResource = rxResource({
    stream: () =>
      this.rolesApiService.list().pipe(
        catchError((err) => {
          this.notify(err);
          return of([] as IRole[]);
        }),
      ),
    defaultValue: [] as IRole[],
  });

  protected async openCreateDialog(): Promise<void> {
    const { RoleDialogComponent } =
      await import('./role-dialog/role-dialog.component');

    this.responsiveDialogService
      .open<IRole | null>(
        new PolymorpheusComponent(RoleDialogComponent, this.injector),
        {
          closable: true,
          data: null,
          label: this.translateService.instant(
            'SETTINGS.ROLES.DIALOG_TITLE_CREATE',
          ),
          size: 'm',
        },
      )
      .pipe(finalize(() => this.rolesResource.reload()))
      .subscribe();
  }

  protected async openEditDialog(role: IRole): Promise<void> {
    const { RoleDialogComponent } =
      await import('./role-dialog/role-dialog.component');

    this.responsiveDialogService
      .open<IRole | null>(
        new PolymorpheusComponent(RoleDialogComponent, this.injector),
        {
          closable: true,
          data: role,
          label: this.translateService.instant(
            'SETTINGS.ROLES.DIALOG_TITLE_EDIT',
          ),
          size: 'm',
        },
      )
      .pipe(finalize(() => this.rolesResource.reload()))
      .subscribe();
  }

  protected deleteRole(role: IRole): void {
    if (role.isDefault) {
      this.notificationService
        .open(
          this.translateService.instant('SETTINGS.ROLES.CANNOT_DELETE_DEFAULT'),
          { appearance: 'negative' },
        )
        .subscribe();
      return;
    }

    this.responsiveDialogService
      .open<boolean>(TUI_CONFIRM, {
        label: this.translateService.instant('SETTINGS.ROLES.DELETE_CONFIRM'),
        data: {
          yes: this.translateService.instant('GENERAL.DELETE'),
          no: this.translateService.instant('GENERAL.CANCEL'),
          appearance: 'negative',
        } satisfies TuiConfirmData,
      })
      .subscribe((confirmed) => {
        if (!confirmed) return;

        this.rolesApiService.remove(role.id).subscribe({
          next: () => {
            this.rolesResource.reload();
          },
          error: (err) => {
            this.notify(err);
          },
        });
      });
  }

  private notify(err: unknown): void {
    this.notificationService
      .open(this.apiErrorService.translate(err, 'GENERAL.REQ_ERR'), {
        appearance: 'negative',
        label: this.translateService.instant('GENERAL.REQ_ERR'),
      })
      .subscribe();
  }
}
