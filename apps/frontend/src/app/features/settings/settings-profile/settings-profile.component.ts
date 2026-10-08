import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  Injector,
  linkedSignal,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Store } from '@ngrx/store';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  TuiButton,
  TuiDialogService,
  TuiError,
  TuiInput,
  TuiLink,
  TuiNotificationService,
  TuiTextfield,
} from '@taiga-ui/core';
import { TuiCardLarge, TuiForm, TuiHeader } from '@taiga-ui/layout';
import {
  TuiSwitch,
  TuiFiles,
  TuiAvatar,
  TuiFileLike,
  TuiButtonLoading,
} from '@taiga-ui/kit';
import { PolymorpheusComponent } from '@taiga-ui/polymorpheus';
import { AuthActions } from '@core/auth/auth.actions';
import {
  selectAuthLoading,
  selectCurrentUser,
} from '@core/auth/auth.selectors';
import {
  emailSchema,
  EUserRole,
  fullnameSchema,
  IProfileUpdate,
  maxAvatarSize,
  passwordSchema,
  usernameSchema,
} from '@konvoez/shared';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ProfileApiService } from '@core/api/profile-api.service';
import { LowerCasePipe, NgOptimizedImage } from '@angular/common';
import { parseError } from '@shared/functions/parse-error.function';
import type { IUserDeleteDialogResult } from '@shared/components/user-delete-dialog/user-delete-dialog.component';
import {
  createZodError,
  createZodFieldValidator,
  createZodFormValidator,
} from '@shared/functions/zod-validator.function';
import { getProfileFormSchema } from '@shared/schemas/forms.schema';
import { map, startWith } from 'rxjs';

@Component({
  selector: 'app-settings-profile',
  imports: [
    ReactiveFormsModule,
    TranslatePipe,
    LowerCasePipe,
    NgOptimizedImage,
    TuiButton,
    TuiTextfield,
    TuiCardLarge,
    TuiError,
    TuiForm,
    TuiHeader,
    TuiFiles,
    TuiInput,
    TuiSwitch,
    TuiAvatar,
    TuiLink,
    TuiButtonLoading,
  ],
  templateUrl: './settings-profile.component.html',
  styleUrl: './settings-profile.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsProfileComponent {
  private readonly store = inject(Store);
  private readonly profileApiService = inject(ProfileApiService);
  private readonly translateService = inject(TranslateService);
  private readonly tuiNotificationsService = inject(TuiNotificationService);
  private readonly dialogService = inject(TuiDialogService);
  private readonly injector = inject(Injector);

  protected readonly currentUser = this.store.selectSignal(selectCurrentUser);
  protected readonly maxAvatarSize = maxAvatarSize;
  protected readonly canDeleteAccount = computed(() => {
    const currentUser = this.currentUser();
    return currentUser != null && currentUser.role !== EUserRole.OWNER;
  });
  protected readonly form = new FormGroup(
    {
      username: new FormControl('', {
        nonNullable: true,
        validators: [createZodFieldValidator(usernameSchema)],
      }),
      fullname: new FormControl('', {
        nonNullable: true,
        validators: [createZodFieldValidator(fullnameSchema)],
      }),
      email: new FormControl('', {
        nonNullable: true,
        validators: [createZodFieldValidator(emailSchema)],
      }),
      password: new FormControl(
        { value: '', disabled: true },
        {
          nonNullable: true,
          validators: [createZodFieldValidator(passwordSchema)],
        },
      ),
      confirmPassword: new FormControl(
        { value: '', disabled: true },
        {
          nonNullable: true,
          validators: [createZodFieldValidator(passwordSchema)],
        },
      ),
      isChangingPassword: new FormControl(false, { nonNullable: true }),
      avatar: new FormControl<string | null>(null),
      avatarFile: new FormControl<TuiFileLike | null>(null),
    },
    {
      validators: [
        createZodFormValidator((control) =>
          getProfileFormSchema(
            Boolean(control.get('isChangingPassword')?.value),
          ),
        ),
      ],
    },
  );
  protected readonly errors = createZodError(this.form, (control) =>
    getProfileFormSchema(Boolean(control.get('isChangingPassword')?.value)),
  );
  protected readonly avatarUrl = linkedSignal<string | null>(
    () => this.currentUser()?.avatarUrl ?? null,
  );
  protected readonly isSaveDisabled = toSignal(
    this.form.events.pipe(
      map(() => this.form.pristine),
      startWith(this.form.pristine),
    ),
    { initialValue: this.form.pristine },
  );
  protected readonly loading = this.store.selectSignal(selectAuthLoading);

  constructor() {
    this.form.controls.isChangingPassword.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((isChangingPassword) => {
        const { password, confirmPassword } = this.form.controls;
        password.setValue('');
        confirmPassword.setValue('');
        if (isChangingPassword) {
          password.enable();
          confirmPassword.enable();
        } else {
          password.disable();
          confirmPassword.disable();
        }
      });

    effect(() => {
      const currentUser = this.currentUser();
      if (!currentUser) {
        return;
      }

      this.form.reset({
        username: currentUser.username,
        fullname: currentUser.fullname,
        email: currentUser.email,
        password: '',
        confirmPassword: '',
        isChangingPassword: false,
        avatar: currentUser.avatar ?? null,
        avatarFile: null,
      });
      this.avatarUrl.set(currentUser.avatarUrl ?? null);
    });

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
          this.tuiNotificationsService.open(
            this.translateService.instant('VALIDATION.FILE_TOO_BIG'),
            {
              appearance: 'negative',
              autoClose: 5000,
              closable: true,
              label: this.translateService.instant('GENERAL.REQ_ERR'),
            },
          );
          return;
        }
        this.profileApiService.avatarUpload(avatarFile as File).subscribe({
          next: (result) => {
            this.form.patchValue({
              avatar: result.key,
            });
            this.avatarUrl.set(result.url);
          },
          error: (err) => {
            this.tuiNotificationsService.open(parseError(err), {
              appearance: 'negative',
              autoClose: 5000,
              closable: true,
              label: this.translateService.instant('GENERAL.REQ_ERR'),
            });
          },
        });
      });
  }

  protected onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const values = this.form.getRawValue();
    const body: IProfileUpdate = {
      username: values.username,
      fullname: values.fullname,
      email: values.email,
      avatar: values.avatar ?? undefined,
    };

    if (values.isChangingPassword) {
      body.password = values.password;
    }

    this.store.dispatch(
      AuthActions.requestPatchUser({
        body,
      }),
    );
  }

  protected logout(): void {
    this.store.dispatch(AuthActions.requestLogout());
  }

  protected openDelete(): void {
    void this.openDeleteDialog();
  }

  private async openDeleteDialog(): Promise<void> {
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
        this.store.dispatch(
          AuthActions.requestDeleteSelf({
            fullDeletion: result.fullDeletion,
          }),
        );
      });
  }
}
