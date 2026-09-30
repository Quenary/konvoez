import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  Injector,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { IUser } from '@konvoez/shared';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { parseError } from '@shared/functions/parse-error.function';
import { UserAvatarComponent } from '@shared/components/user-avatar/user-avatar.component';
import { TuiTable } from '@taiga-ui/addon-table';
import {
  TuiDialogService,
  TuiHint,
  TuiNotificationService,
  TuiTitle,
} from '@taiga-ui/core';
import { TuiAutoColorPipe } from '@taiga-ui/kit';
import { TuiCardLarge, TuiHeader } from '@taiga-ui/layout';
import { PolymorpheusComponent } from '@taiga-ui/polymorpheus';
import { catchError, finalize, of } from 'rxjs';
import { UserManagementApiService } from './user-management-api.service';

@Component({
  selector: 'app-settings-user-management',
  imports: [
    DatePipe,
    TranslatePipe,
    UserAvatarComponent,
    TuiAutoColorPipe,
    TuiCardLarge,
    TuiHeader,
    TuiHint,
    TuiTable,
    TuiTitle,
  ],
  templateUrl: './settings-user-management.component.html',
  styleUrl: './settings-user-management.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsUserManagementComponent {
  private readonly userManagementApiService = inject(UserManagementApiService);
  private readonly dialogService = inject(TuiDialogService);
  private readonly translateService = inject(TranslateService);
  private readonly notificationService = inject(TuiNotificationService);
  private readonly injector = inject(Injector);

  protected readonly usersResource = rxResource({
    stream: () =>
      this.userManagementApiService.list().pipe(
        catchError((err) => {
          this.notify(err);
          return of([] as IUser[]);
        }),
      ),
    defaultValue: [] as IUser[],
  });

  protected openUser(id: number): void {
    void this.openUserDialog(id);
  }

  private async openUserDialog(id: number): Promise<void> {
    const { SettingsUserManagementDialogComponent } =
      await import('./settings-user-management-dialog/settings-user-management-dialog.component');

    this.dialogService
      .open<boolean>(
        new PolymorpheusComponent(
          SettingsUserManagementDialogComponent,
          this.injector,
        ),
        {
          closable: true,
          data: { id },
          label: this.translateService.instant('SETTINGS.USERS.DIALOG_TITLE'),
          size: 'm',
        },
      )
      .pipe(finalize(() => this.usersResource.reload()))
      .subscribe();
  }

  private notify(err: unknown): void {
    this.notificationService
      .open(parseError(err), {
        appearance: 'negative',
        label: this.translateService.instant('GENERAL.REQ_ERR'),
      })
      .subscribe();
  }
}
