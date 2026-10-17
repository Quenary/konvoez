import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { ERoomType, maxAvatarSize, IRole } from '@konvoez/shared';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { IRoom } from '@konvoez/shared';
import { injectContext } from '@taiga-ui/polymorpheus';
import {
  TuiButton,
  TuiCheckbox,
  TuiDialogContext,
  TuiError,
  TuiInput,
  TuiLabel,
  TuiLink,
  TuiNotificationService,
  TuiTextfield,
  TUI_ITEMS_HANDLERS,
  TUI_DEFAULT_ITEMS_HANDLERS,
} from '@taiga-ui/core';
import { TuiForm } from '@taiga-ui/layout';
import {
  TuiAutoColorPipe,
  TuiAvatar,
  TuiDataListWrapper,
  TuiFileLike,
  TuiFiles,
  TuiSelect,
  TuiSwitch,
} from '@taiga-ui/kit';
import {
  rxResource,
  takeUntilDestroyed,
  toSignal,
} from '@angular/core/rxjs-interop';
import { RoomsApiService } from '@core/api/rooms-api.service';
import { RolesApiService } from '@core/api/roles-api.service';
import { UsersStore } from '@core/stores/users.store';
import { LowerCasePipe, NgOptimizedImage } from '@angular/common';
import { catchError, of } from 'rxjs';
import { ApiErrorService } from '@core/services/api-error.service';
import { DayjsPipe } from '@shared/pipes/dayjs.pipe';
import {
  createZodError,
  createZodFieldValidator,
  createZodFormValidator,
} from '@shared/functions/zod-validator.function';
import { roomFormSchema } from '@shared/schemas/forms.schema';

export type RoomDialogData = Partial<IRoom>;

/**
 * Create/update room dialog component
 */
@Component({
  selector: 'app-room-dialog',
  imports: [
    DayjsPipe,
    ReactiveFormsModule,
    TranslatePipe,
    LowerCasePipe,
    NgOptimizedImage,
    TuiButton,
    TuiCheckbox,
    TuiError,
    TuiForm,
    TuiInput,
    TuiTextfield,
    TuiLabel,
    TuiSelect,
    TuiDataListWrapper,
    TuiFiles,
    TuiAutoColorPipe,
    TuiAvatar,
    TuiLink,
    TuiSwitch,
  ],
  providers: [
    {
      provide: TUI_ITEMS_HANDLERS,
      useFactory: () => {
        const translateService = inject(TranslateService);
        return {
          stringify: signal((type: ERoomType) =>
            translateService.instant(
              type === ERoomType.TEXT
                ? 'ROOMS.DIALOG.TEXT'
                : 'ROOMS.DIALOG.VOICE',
            ),
          ),
          identityMatcher: TUI_DEFAULT_ITEMS_HANDLERS.identityMatcher,
          disabledItemHandler: TUI_DEFAULT_ITEMS_HANDLERS.disabledItemHandler,
        };
      },
    },
  ],
  templateUrl: './room-dialog.component.html',
  styleUrl: './room-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RoomDialogComponent {
  private readonly context =
    injectContext<TuiDialogContext<RoomDialogData | null, RoomDialogData>>();
  private readonly translateService = inject(TranslateService);
  private readonly roomsApiService = inject(RoomsApiService);
  private readonly rolesApiService = inject(RolesApiService);
  private readonly usersStore = inject(UsersStore);
  private readonly tuiNotificationsService = inject(TuiNotificationService);
  private readonly apiErrorService = inject(ApiErrorService);

  protected readonly maxAvatarSize = maxAvatarSize;
  protected readonly typeOptions = [ERoomType.TEXT, ERoomType.VOICE];
  protected readonly form = new FormGroup(
    {
      name: new FormControl(this.context.data.name ?? '', {
        nonNullable: true,
        validators: [createZodFieldValidator(roomFormSchema.shape.name)],
      }),
      type: new FormControl(this.context.data.type ?? ERoomType.TEXT, {
        nonNullable: true,
        validators: [createZodFieldValidator(roomFormSchema.shape.type)],
      }),
      avatar: new FormControl<string | null>(this.context.data.avatar ?? null),
      avatarFile: new FormControl<TuiFileLike | null>(null),
      isPrivate: new FormControl(this.context.data.isPrivate ?? false, {
        nonNullable: true,
        validators: [createZodFieldValidator(roomFormSchema.shape.isPrivate)],
      }),
    },
    {
      validators: [createZodFormValidator(roomFormSchema)],
    },
  );
  protected readonly errors = createZodError(this.form, roomFormSchema);
  protected readonly avatarUrl = signal<string | null>(
    this.context.data.avatarUrl ?? null,
  );
  protected readonly isPrivate = toSignal(
    this.form.controls.isPrivate.valueChanges,
    { initialValue: this.form.controls.isPrivate.value },
  );

  protected readonly selectedRoleIds = signal<Set<number>>(
    new Set(this.context.data.allowedRoleIds ?? []),
  );
  protected readonly selectedUserIds = signal<Set<number>>(
    new Set(this.context.data.allowedUserIds ?? []),
  );

  protected readonly availableRolesResource = rxResource({
    stream: () =>
      this.rolesApiService.list().pipe(catchError(() => of([] as IRole[]))),
    defaultValue: [] as IRole[],
  });

  protected readonly users = this.usersStore.entities;

  protected readonly meta = this.context.data.id
    ? {
        author: this.context.data.author,
        createdAt: this.context.data.createdAt,
        updatedAt: this.context.data.updatedAt,
      }
    : null;

  constructor() {
    this.usersStore.loadAll();

    this.form.controls.avatarFile.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((avatarFile) => {
        if (!avatarFile) {
          return;
        }
        if (
          typeof avatarFile.size === 'number' &&
          avatarFile.size > maxAvatarSize
        ) {
          this.form.controls.avatarFile.setValue(null, { emitEvent: false });
          this.tuiNotificationsService
            .open(this.translateService.instant('VALIDATION.FILE_TOO_BIG'), {
              appearance: 'negative',
              autoClose: 5000,
              closable: true,
              label: this.translateService.instant('GENERAL.REQ_ERR'),
            })
            .subscribe();
          return;
        }
        this.roomsApiService.avatarUpload(avatarFile as File).subscribe({
          next: (result) => {
            this.form.patchValue({
              avatar: result.key,
            });
            this.avatarUrl.set(result.url);
          },
          error: (err) => {
            this.tuiNotificationsService
              .open(this.apiErrorService.translate(err, 'GENERAL.REQ_ERR'), {
                appearance: 'negative',
                autoClose: 5000,
                closable: true,
                label: this.translateService.instant('GENERAL.REQ_ERR'),
              })
              .subscribe();
          },
        });
      });
  }

  protected toggleRole(roleId: number, checked: boolean): void {
    const next = new Set(this.selectedRoleIds());
    if (checked) {
      next.add(roleId);
    } else {
      next.delete(roleId);
    }
    this.selectedRoleIds.set(next);
  }

  protected isRoleSelected(roleId: number): boolean {
    return this.selectedRoleIds().has(roleId);
  }

  protected toggleUser(userId: number, checked: boolean): void {
    const next = new Set(this.selectedUserIds());
    if (checked) {
      next.add(userId);
    } else {
      next.delete(userId);
    }
    this.selectedUserIds.set(next);
  }

  protected isUserSelected(userId: number): boolean {
    return this.selectedUserIds().has(userId);
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const { name, type, avatar, isPrivate } = this.form.getRawValue();
    this.context.completeWith({
      ...this.context.data,
      name,
      type,
      avatar: avatar ?? undefined,
      avatarUrl: this.avatarUrl(),
      isPrivate,
      allowedRoleIds: isPrivate ? Array.from(this.selectedRoleIds()) : [],
      allowedUserIds: isPrivate ? Array.from(this.selectedUserIds()) : [],
    });
  }

  close(): void {
    this.context.completeWith(null);
  }
}
