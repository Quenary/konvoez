import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  Injector,
  signal,
} from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { selectCurrentUser } from '@core/auth/auth.selectors';
import { EUserRole, IUser } from '@konvoez/shared';
import { Store } from '@ngrx/store';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { parseError } from '@shared/functions/parse-error.function';
import { DayjsPipe } from '@shared/pipes/dayjs.pipe';
import { UserAvatarComponent } from '@shared/components/user-avatar/user-avatar.component';
import type { IUserDeleteDialogResult } from '@shared/components/user-delete-dialog/user-delete-dialog.component';
import {
  TuiButton,
  TuiDialogService,
  TuiDropdown,
  TuiHint,
  TuiNotificationService,
  TuiTextfield,
  TUI_DEFAULT_ITEMS_HANDLERS,
  TUI_ITEMS_HANDLERS,
} from '@taiga-ui/core';
import type { TuiDialogContext } from '@taiga-ui/core';
import {
  TuiAutoColorPipe,
  TuiButtonLoading,
  TuiChevron,
  TuiDataListWrapper,
  TuiSelect,
} from '@taiga-ui/kit';
import { injectContext, PolymorpheusComponent } from '@taiga-ui/polymorpheus';
import { catchError, of } from 'rxjs';
import { UserManagementApiService } from '@core/api/user-management-api.service';

export interface IUserManagementDialogData {
  readonly id: number;
}

const ROLE_LABEL: Record<EUserRole, string> = {
  [EUserRole.OWNER]: 'SETTINGS.USERS.ROLE_OWNER',
  [EUserRole.ADMIN]: 'SETTINGS.USERS.ROLE_ADMIN',
  [EUserRole.MEMBER]: 'SETTINGS.USERS.ROLE_MEMBER',
};

@Component({
  selector: 'app-settings-user-management-dialog',
  imports: [
    DayjsPipe,
    ReactiveFormsModule,
    TranslatePipe,
    UserAvatarComponent,
    TuiAutoColorPipe,
    TuiButton,
    TuiButtonLoading,
    TuiChevron,
    TuiDataListWrapper,
    TuiDropdown,
    TuiHint,
    TuiSelect,
    TuiTextfield,
  ],
  providers: [
    {
      provide: TUI_ITEMS_HANDLERS,
      useFactory: () => {
        const translateService = inject(TranslateService);
        return {
          stringify: signal((role: EUserRole) =>
            translateService.instant(ROLE_LABEL[role]),
          ),
          identityMatcher: TUI_DEFAULT_ITEMS_HANDLERS.identityMatcher,
          disabledItemHandler: TUI_DEFAULT_ITEMS_HANDLERS.disabledItemHandler,
        };
      },
    },
  ],
  templateUrl: './settings-user-management-dialog.component.html',
  styleUrl: './settings-user-management-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsUserManagementDialogComponent {
  private readonly userManagementApiService = inject(UserManagementApiService);
  private readonly dialogService = inject(TuiDialogService);
  private readonly translateService = inject(TranslateService);
  private readonly notificationService = inject(TuiNotificationService);
  private readonly injector = inject(Injector);
  private readonly store = inject(Store);

  public readonly context =
    injectContext<TuiDialogContext<boolean, IUserManagementDialogData>>();

  protected readonly roleLabels = ROLE_LABEL;
  protected readonly roleOptions = [EUserRole.ADMIN, EUserRole.MEMBER];
  protected readonly saving = signal(false);
  protected readonly deleting = signal(false);
  protected readonly roleControl = new FormControl<EUserRole>(
    EUserRole.MEMBER,
    { nonNullable: true },
  );

  private readonly selectedRole = toSignal(this.roleControl.valueChanges, {
    initialValue: this.roleControl.value,
  });
  private readonly currentUser = this.store.selectSignal(selectCurrentUser);

  protected readonly userResource = rxResource({
    stream: () =>
      this.userManagementApiService.get(this.context.data.id).pipe(
        catchError((err) => {
          this.notify(err);
          return of(null);
        }),
      ),
    defaultValue: null as IUser | null,
  });

  protected readonly canManage = computed(() => {
    const user = this.userResource.value();
    const me = this.currentUser();
    if (!user || !me) {
      return false;
    }
    return user.role !== EUserRole.OWNER && user.id !== me.id;
  });

  protected readonly roleChanged = computed(() => {
    const user = this.userResource.value();
    const selected = this.selectedRole();
    if (!user) {
      return false;
    }
    return selected !== user.role;
  });

  constructor() {
    effect(() => {
      const user = this.userResource.value();
      if (!user) {
        return;
      }
      if (user.role === EUserRole.ADMIN || user.role === EUserRole.MEMBER) {
        this.roleControl.setValue(user.role);
      }
    });
  }

  protected saveRole(): void {
    const user = this.userResource.value();
    const role = this.roleControl.value;
    if (
      !user ||
      !this.canManage() ||
      role === user.role ||
      this.saving() ||
      (role !== EUserRole.ADMIN && role !== EUserRole.MEMBER)
    ) {
      return;
    }

    this.saving.set(true);
    this.userManagementApiService.update(user.id, { role }).subscribe({
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
      .open(parseError(err), {
        appearance: 'negative',
        label: this.translateService.instant('GENERAL.REQ_ERR'),
      })
      .subscribe();
  }
}
