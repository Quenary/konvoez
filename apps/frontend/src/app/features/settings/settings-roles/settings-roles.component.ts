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
import {
  TuiButton,
  TuiHint,
  TuiIcon,
  TuiNotificationService,
  TuiTitle,
} from '@taiga-ui/core';
import { TuiBadge, TuiFade } from '@taiga-ui/kit';
import { TuiHeader } from '@taiga-ui/layout';
import { PolymorpheusComponent } from '@taiga-ui/polymorpheus';
import { TuiResponsiveDialogService } from '@taiga-ui/addon-mobile';
import { catchError, finalize, of } from 'rxjs';
import { RolesApiService } from '@core/api/roles-api.service';
import { ApiErrorService } from '@core/services/api-error.service';
import { LayoutService } from '@core/services/layout.service';
import { HeaderBackButtonComponent } from '@shared/components/header-back-button/header-back-button.component';
import { RoutePageComponent } from '@shared/components/route-page/route-page.component';
import { icons } from '@constants';

@Component({
  selector: 'app-settings-roles',
  imports: [
    HeaderBackButtonComponent,
    RoutePageComponent,
    TranslatePipe,
    TuiBadge,
    TuiButton,
    TuiFade,
    TuiHeader,
    TuiTable,
    TuiTitle,
    TuiIcon,
    TuiHint,
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
  private readonly layoutService = inject(LayoutService);

  protected readonly icons = icons;
  protected readonly isNarrow = this.layoutService.isNarrow;

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

  private notify(err: unknown): void {
    this.notificationService
      .open(this.apiErrorService.translate(err, 'GENERAL.REQ_ERR'), {
        appearance: 'negative',
        label: this.translateService.instant('GENERAL.REQ_ERR'),
      })
      .subscribe();
  }
}
