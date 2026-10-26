import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  Injector,
  linkedSignal,
  signal,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { IUserFull, IRole } from '@konvoez/shared';
import { Store } from '@ngrx/store';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ApiErrorService } from '@core/services/api-error.service';
import { DayjsPipe } from '@shared/pipes/dayjs.pipe';
import { UserAvatarComponent } from '@shared/components/user-avatar/user-avatar.component';
import type { IUserDeleteDialogResult } from '@shared/components/user-delete-dialog/user-delete-dialog.component';
import {
  TuiButton,
  TuiCheckbox,
  TuiHint,
  TuiLabel,
  TuiNotificationService,
} from '@taiga-ui/core';
import { TuiResponsiveDialogService } from '@taiga-ui/addon-mobile';
import type { TuiDialogContext } from '@taiga-ui/core';
import {
  TuiAutoColorPipe,
  TuiBadge,
  TuiButtonLoading,
  TUI_CONFIRM,
  type TuiConfirmData,
} from '@taiga-ui/kit';
import { injectContext, PolymorpheusComponent } from '@taiga-ui/polymorpheus';
import { catchError, of } from 'rxjs';
import { UserManagementApiService } from '@core/api/user-management-api.service';
import { RolesApiService } from '@core/api/roles-api.service';
import { selectCurrentUser } from '@core/auth/auth.selectors';

export interface IUserManagementDialogData {
  readonly id: number;
}

export interface IUserManagementRoleOption {
  readonly role: IRole;
  readonly checked: boolean;
}

@Component({
  selector: 'app-settings-user-management-dialog',
  imports: [
    DayjsPipe,
    FormsModule,
    TranslatePipe,
    UserAvatarComponent,
    TuiAutoColorPipe,
    TuiBadge,
    TuiButton,
    TuiButtonLoading,
    TuiCheckbox,
    TuiHint,
    TuiLabel,
  ],
  templateUrl: './settings-user-management-dialog.component.html',
  styleUrl: './settings-user-management-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsUserManagementDialogComponent {
  private readonly userManagementApiService = inject(UserManagementApiService);
  private readonly rolesApiService = inject(RolesApiService);
  private readonly dialogService = inject(TuiResponsiveDialogService);
  private readonly translateService = inject(TranslateService);
  private readonly notificationService = inject(TuiNotificationService);
  private readonly apiErrorService = inject(ApiErrorService);
  private readonly injector = inject(Injector);
  private readonly store = inject(Store);

  public readonly context =
    injectContext<TuiDialogContext<boolean, IUserManagementDialogData>>();

  protected readonly saving = signal(false);
  protected readonly deleting = signal(false);
  protected readonly resetting2fa = signal(false);

  private readonly currentUser = this.store.selectSignal(selectCurrentUser);

  protected readonly userResource = rxResource({
    stream: () =>
      this.userManagementApiService.get(this.context.data.id).pipe(
        catchError((err) => {
          this.notify(err);
          return of(null);
        }),
      ),
    defaultValue: null as IUserFull | null,
  });

  protected readonly selectedRoleIds = linkedSignal(() => {
    const user = this.userResource.value();
    return new Set((user?.roles ?? []).map((r) => r.id));
  });

  protected readonly availableRolesResource = rxResource({
    stream: () =>
      this.rolesApiService.list().pipe(
        catchError((err) => {
          this.notify(err);
          return of([] as IRole[]);
        }),
      ),
    defaultValue: [] as IRole[],
  });

  protected readonly roleOptions = computed<
    readonly IUserManagementRoleOption[]
  >(() => {
    const roles = this.availableRolesResource.value() ?? [];
    const selected = this.selectedRoleIds();
    return roles.map((role) => ({
      role,
      checked: selected.has(role.id),
    }));
  });

  protected readonly canManage = computed(() => {
    const user = this.userResource.value();
    const me = this.currentUser();
    if (!user || !me) {
      return false;
    }
    return !user.isOwner && user.id !== me.id;
  });

  protected readonly roleChanged = computed(() => {
    const user = this.userResource.value();
    const selected = this.selectedRoleIds();
    if (!user) {
      return false;
    }
    const current = new Set((user.roles ?? []).map((r) => r.id));
    if (selected.size !== current.size) {
      return true;
    }
    for (const id of selected) {
      if (!current.has(id)) {
        return true;
      }
    }
    return false;
  });

  protected toggleRole(roleId: number, checkedOrEvent: boolean | Event): void {
    const checked =
      typeof checkedOrEvent === 'boolean'
        ? checkedOrEvent
        : Boolean((checkedOrEvent.target as HTMLInputElement | null)?.checked);
    const next = new Set(this.selectedRoleIds());
    if (checked) {
      next.add(roleId);
    } else {
      next.delete(roleId);
    }
    this.selectedRoleIds.set(next);
  }

  protected saveRole(): void {
    const user = this.userResource.value();
    if (!user || !this.canManage() || !this.roleChanged() || this.saving()) {
      return;
    }

    this.saving.set(true);
    const roleIds = Array.from(this.selectedRoleIds());
    this.userManagementApiService.update(user.id, { roleIds }).subscribe({
      next: () => {
        this.saving.set(false);
        this.userResource.reload();
      },
      error: (err) => {
        this.saving.set(false);
        this.notify(err);
      },
    });
  }

  protected resetTwoFactor(id: number): void {
    this.dialogService
      .open<boolean>(TUI_CONFIRM, {
        label: this.translateService.instant(
          'SETTINGS.USERS.TWO_FACTOR_RESET_CONFIRM',
        ),
        data: {
          yes: this.translateService.instant('SETTINGS.USERS.TWO_FACTOR_RESET'),
          no: this.translateService.instant('GENERAL.CANCEL'),
          appearance: 'secondary-destructive',
        } satisfies TuiConfirmData,
      })
      .subscribe((confirmed) => {
        if (!confirmed) {
          return;
        }
        this.resetting2fa.set(true);
        this.userManagementApiService.resetTwoFactor(id).subscribe({
          next: () => {
            this.resetting2fa.set(false);
            this.userResource.reload();
          },
          error: (err) => {
            this.resetting2fa.set(false);
            this.notify(err);
          },
        });
      });
  }

  protected openDelete(): void {
    const user = this.userResource.value();
    if (!user || !this.canManage() || this.deleting()) {
      return;
    }
    void this.openDeleteDialog(user.id);
  }

  private async openDeleteDialog(id: number): Promise<void> {
    const { UserDeleteDialogComponent } =
      await import('@shared/components/user-delete-dialog/user-delete-dialog.component');

    this.dialogService
      .open<IUserDeleteDialogResult | null>(
        new PolymorpheusComponent(UserDeleteDialogComponent, this.injector),
        {
          closable: true,
          label: this.translateService.instant('USER_DELETE.TITLE'),
          size: 's',
        },
      )
      .subscribe((result) => {
        if (!result) {
          return;
        }
        if (result.fullDeletion) {
          this.removePhysically(id);
          return;
        }
        this.anonymize(id);
      });
  }

  private anonymize(id: number): void {
    this.deleting.set(true);
    this.userManagementApiService.anonymize(id).subscribe({
      next: () => {
        this.deleting.set(false);
        this.userResource.reload();
      },
      error: (err) => {
        this.deleting.set(false);
        this.notify(err);
      },
    });
  }

  private removePhysically(id: number): void {
    this.deleting.set(true);
    this.userManagementApiService.remove(id).subscribe({
      next: () => {
        this.context.completeWith(true);
      },
      error: (err) => {
        this.deleting.set(false);
        this.notify(err);
      },
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
