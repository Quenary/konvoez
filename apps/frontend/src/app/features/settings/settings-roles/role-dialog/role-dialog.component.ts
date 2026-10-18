import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { EPermission, ICreateRole, IRole, IUpdateRole } from '@konvoez/shared';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { injectContext } from '@taiga-ui/polymorpheus';
import {
  TuiButton,
  TuiCheckbox,
  TuiDialogContext,
  TuiError,
  TuiInput,
  TuiLabel,
  TuiNotificationService,
  TuiTextfield,
} from '@taiga-ui/core';
import { TuiButtonLoading, TuiSwitch } from '@taiga-ui/kit';
import { TuiForm } from '@taiga-ui/layout';
import { RolesApiService } from '@core/api/roles-api.service';
import { ApiErrorService } from '@core/services/api-error.service';
import {
  createZodError,
  createZodFieldValidator,
  createZodFormValidator,
} from '@shared/functions/zod-validator.function';
import { roleFormSchema } from '@shared/schemas/forms.schema';

export interface IPermissionOption {
  readonly permission: EPermission;
  readonly labelKey: string;
}

export interface IPermissionItemVm extends IPermissionOption {
  readonly checked: boolean;
}

export const AVAILABLE_PERMISSIONS: readonly IPermissionOption[] = [
  {
    permission: EPermission.MANAGE_SETTINGS,
    labelKey: 'SETTINGS.ROLES.PERMISSIONS_LIST.MANAGE_SETTINGS',
  },
  {
    permission: EPermission.MANAGE_USERS,
    labelKey: 'SETTINGS.ROLES.PERMISSIONS_LIST.MANAGE_USERS',
  },
  {
    permission: EPermission.MANAGE_ROLES,
    labelKey: 'SETTINGS.ROLES.PERMISSIONS_LIST.MANAGE_ROLES',
  },
  {
    permission: EPermission.MANAGE_INVITES,
    labelKey: 'SETTINGS.ROLES.PERMISSIONS_LIST.MANAGE_INVITES',
  },
  {
    permission: EPermission.MANAGE_ROOMS,
    labelKey: 'SETTINGS.ROLES.PERMISSIONS_LIST.MANAGE_ROOMS',
  },
  {
    permission: EPermission.SEND_MESSAGES,
    labelKey: 'SETTINGS.ROLES.PERMISSIONS_LIST.SEND_MESSAGES',
  },
  {
    permission: EPermission.CONNECT_VOICE,
    labelKey: 'SETTINGS.ROLES.PERMISSIONS_LIST.CONNECT_VOICE',
  },
  {
    permission: EPermission.USE_ATTACHMENTS,
    labelKey: 'SETTINGS.ROLES.PERMISSIONS_LIST.USE_ATTACHMENTS',
  },
  {
    permission: EPermission.MODERATE_MESSAGES,
    labelKey: 'SETTINGS.ROLES.PERMISSIONS_LIST.MODERATE_MESSAGES',
  },
];

@Component({
  selector: 'app-role-dialog',
  imports: [
    ReactiveFormsModule,
    TranslatePipe,
    TuiButton,
    TuiButtonLoading,
    TuiCheckbox,
    TuiError,
    TuiForm,
    TuiInput,
    TuiLabel,
    TuiSwitch,
    TuiTextfield,
  ],
  templateUrl: './role-dialog.component.html',
  styleUrl: './role-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RoleDialogComponent {
  public readonly context =
    injectContext<TuiDialogContext<IRole | null, IRole | null>>();
  private readonly rolesApiService = inject(RolesApiService);
  private readonly apiErrorService = inject(ApiErrorService);
  private readonly notificationService = inject(TuiNotificationService);
  private readonly translateService = inject(TranslateService);

  protected readonly availablePermissions = AVAILABLE_PERMISSIONS;
  protected readonly isEdit = Boolean(this.context.data?.id);
  protected readonly loading = signal(false);
  protected readonly selectedPermissions = signal<Set<EPermission>>(
    new Set(this.context.data?.permissions ?? []),
  );
  protected readonly permissionItems = computed<readonly IPermissionItemVm[]>(
    () => {
      const selected = this.selectedPermissions();
      return AVAILABLE_PERMISSIONS.map((opt) => ({
        ...opt,
        checked: selected.has(opt.permission),
      }));
    },
  );

  protected readonly form = new FormGroup(
    {
      name: new FormControl(this.context.data?.name ?? '', {
        nonNullable: true,
        validators: [createZodFieldValidator(roleFormSchema.shape.name)],
      }),
      color: new FormControl(this.context.data?.color ?? '', {
        nonNullable: true,
        validators: [createZodFieldValidator(roleFormSchema.shape.color)],
      }),
      isDefault: new FormControl(this.context.data?.isDefault ?? false, {
        nonNullable: true,
        validators: [createZodFieldValidator(roleFormSchema.shape.isDefault)],
      }),
    },
    {
      validators: [createZodFormValidator(roleFormSchema)],
    },
  );

  protected readonly errors = createZodError(this.form, roleFormSchema);

  protected togglePermission(
    permission: EPermission,
    checkedOrEvent: boolean | Event,
  ): void {
    const checked =
      typeof checkedOrEvent === 'boolean'
        ? checkedOrEvent
        : Boolean((checkedOrEvent.target as HTMLInputElement | null)?.checked);
    const next = new Set(this.selectedPermissions());
    if (checked) {
      next.add(permission);
    } else {
      next.delete(permission);
    }
    this.selectedPermissions.set(next);
  }

  protected onSubmit(): void {
    if (this.loading()) return;

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading.set(true);

    const { name, color, isDefault } = this.form.getRawValue();
    const permissions = Array.from(this.selectedPermissions());
    const trimmedColor = color.trim() ? color.trim() : null;

    if (this.isEdit && this.context.data?.id) {
      const dto: IUpdateRole = {
        name,
        color: trimmedColor,
        isDefault,
        permissions,
      };
      this.rolesApiService.update(this.context.data.id, dto).subscribe({
        next: (role) => {
          this.loading.set(false);
          this.context.completeWith(role);
        },
        error: (err) => {
          this.loading.set(false);
          this.notificationService
            .open(this.apiErrorService.translate(err, 'GENERAL.REQ_ERR'), {
              appearance: 'negative',
              label: this.translateService.instant('GENERAL.REQ_ERR'),
            })
            .subscribe();
        },
      });
    } else {
      const dto: ICreateRole = {
        name,
        color: trimmedColor,
        priority: 0,
        isDefault,
        permissions,
      };
      this.rolesApiService.create(dto).subscribe({
        next: (role) => {
          this.loading.set(false);
          this.context.completeWith(role);
        },
        error: (err) => {
          this.loading.set(false);
          this.notificationService
            .open(this.apiErrorService.translate(err, 'GENERAL.REQ_ERR'), {
              appearance: 'negative',
              label: this.translateService.instant('GENERAL.REQ_ERR'),
            })
            .subscribe();
        },
      });
    }
  }

  protected close(): void {
    this.context.completeWith(null);
  }
}
