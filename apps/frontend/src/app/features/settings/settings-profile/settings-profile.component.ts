import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  Injector,
  linkedSignal,
  signal,
} from '@angular/core';
import {
  FormControl,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
} from '@angular/forms';
import { Store } from '@ngrx/store';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  TuiButton,
  TuiError,
  TuiHint,
  TuiIcon,
  TuiInput,
  TuiLink,
  TuiNotification,
  TuiNotificationService,
  TuiScrollbar,
  TuiTextfield,
} from '@taiga-ui/core';
import { TuiResponsiveDialogService } from '@taiga-ui/addon-mobile';
import { TuiCardLarge, TuiForm, TuiHeader } from '@taiga-ui/layout';
import {
  TuiSwitch,
  TuiFiles,
  TuiAvatar,
  TuiBadge,
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
  emailVerificationCodeSchema,
  fullnameSchema,
  IProfileUpdate,
  maxAvatarSize,
  passwordSchema,
  usernameSchema,
} from '@konvoez/shared';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ProfileApiService } from '@core/api/profile-api.service';
import { LowerCasePipe, NgOptimizedImage } from '@angular/common';
import { ApiErrorService } from '@core/services/api-error.service';
import { PublicStore } from '@core/stores/public.store';
import type { IUserDeleteDialogResult } from '@shared/components/user-delete-dialog/user-delete-dialog.component';
import {
  createZodError,
  createZodFieldValidator,
  createZodFormValidator,
} from '@shared/functions/zod-validator.function';
import { getProfileFormSchema } from '@shared/schemas/forms.schema';
import { finalize, map, startWith } from 'rxjs';
import { icons } from '@constants';
import { LayoutService } from '@core/services/layout.service';

@Component({
  selector: 'app-settings-profile',
  imports: [
    FormsModule,
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
    TuiScrollbar,
    TuiFiles,
    TuiInput,
    TuiSwitch,
    TuiAvatar,
    TuiBadge,
    TuiLink,
    TuiButtonLoading,
    TuiIcon,
    TuiHint,
    TuiNotification,
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
  private readonly apiErrorService = inject(ApiErrorService);
  private readonly dialogService = inject(TuiResponsiveDialogService);
  private readonly injector = inject(Injector);
  private readonly layoutService = inject(LayoutService);
  private readonly publicStore = inject(PublicStore);

  protected readonly icons = icons;
  protected readonly isNarrow = this.layoutService.isNarrow;
  protected readonly currentUser = this.store.selectSignal(selectCurrentUser);
  protected readonly maxAvatarSize = maxAvatarSize;

  protected readonly smtpConfigured = this.publicStore.isSmtpConfigured;
  protected readonly isEmailVerified = computed(() =>
    Boolean(this.currentUser()?.emailVerified),
  );
  protected readonly pendingEmail = computed(
    () => this.currentUser()?.pendingEmail ?? null,
  );
  protected readonly isVerificationCardOpen = signal(false);
  protected readonly verificationCode = signal('');
  protected readonly isCodeValid = computed(
    () =>
      emailVerificationCodeSchema.safeParse(this.verificationCode().trim())
        .success,
  );
  protected readonly isVerifying = signal(false);
  protected readonly isResending = signal(false);
  protected readonly isCancellingChange = signal(false);

  protected readonly canDeleteAccount = computed(() => {
    const currentUser = this.currentUser();
    return currentUser != null && !currentUser.isOwner;
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
            this.tuiNotificationsService.open(
              this.apiErrorService.translate(err, 'GENERAL.REQ_ERR'),
              {
                appearance: 'negative',
                autoClose: 5000,
                closable: true,
                label: this.translateService.instant('GENERAL.REQ_ERR'),
              },
            );
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

  protected openVerificationCard(): void {
    this.isVerificationCardOpen.set(true);
  }

  protected requestEmailVerification(): void {
    this.isResending.set(true);
    this.profileApiService
      .requestEmailVerification()
      .pipe(finalize(() => this.isResending.set(false)))
      .subscribe({
        next: () => {
          this.isVerificationCardOpen.set(true);
          this.verificationCode.set('');
          this.tuiNotificationsService
            .open(
              this.translateService.instant(
                'SETTINGS.PROFILE.EMAIL_VERIFICATION.CODE_SENT',
              ),
              {
                appearance: 'positive',
                autoClose: 3000,
              },
            )
            .subscribe();
        },
        error: (err) => this.showError(err),
      });
  }

  protected confirmEmailVerification(): void {
    const code = this.verificationCode().trim();
    if (code.length !== 6) {
      return;
    }

    this.isVerifying.set(true);
    this.profileApiService
      .confirmEmailVerification({ code })
      .pipe(finalize(() => this.isVerifying.set(false)))
      .subscribe({
        next: (user) => {
          this.isVerificationCardOpen.set(false);
          this.verificationCode.set('');
          this.store.dispatch(AuthActions.requestPatchUserSuccess({ user }));
          this.tuiNotificationsService
            .open(
              this.translateService.instant(
                'SETTINGS.PROFILE.EMAIL_VERIFICATION.VERIFIED_SUCCESS',
              ),
              {
                appearance: 'positive',
                autoClose: 3000,
              },
            )
            .subscribe();
        },
        error: (err) => this.showError(err),
      });
  }

  protected confirmEmailChange(): void {
    const code = this.verificationCode().trim();
    if (code.length !== 6) {
      return;
    }

    this.isVerifying.set(true);
    this.profileApiService
      .confirmEmailChange({ code })
      .pipe(finalize(() => this.isVerifying.set(false)))
      .subscribe({
        next: (user) => {
          this.verificationCode.set('');
          this.store.dispatch(AuthActions.requestPatchUserSuccess({ user }));
          this.tuiNotificationsService
            .open(
              this.translateService.instant(
                'SETTINGS.PROFILE.EMAIL_CHANGE.CONFIRMED_SUCCESS',
              ),
              {
                appearance: 'positive',
                autoClose: 3000,
              },
            )
            .subscribe();
        },
        error: (err) => this.showError(err),
      });
  }

  protected resendEmailChange(): void {
    this.isResending.set(true);
    this.profileApiService
      .resendEmailChange()
      .pipe(finalize(() => this.isResending.set(false)))
      .subscribe({
        next: () => {
          this.tuiNotificationsService
            .open(
              this.translateService.instant(
                'SETTINGS.PROFILE.EMAIL_VERIFICATION.CODE_SENT',
              ),
              {
                appearance: 'positive',
                autoClose: 3000,
              },
            )
            .subscribe();
        },
        error: (err) => this.showError(err),
      });
  }

  protected cancelEmailChange(): void {
    this.isCancellingChange.set(true);
    this.profileApiService
      .cancelEmailChange()
      .pipe(finalize(() => this.isCancellingChange.set(false)))
      .subscribe({
        next: (user) => {
          this.verificationCode.set('');
          this.store.dispatch(AuthActions.requestPatchUserSuccess({ user }));
          this.tuiNotificationsService
            .open(
              this.translateService.instant(
                'SETTINGS.PROFILE.EMAIL_CHANGE.CANCELLED_SUCCESS',
              ),
              {
                appearance: 'positive',
                autoClose: 3000,
              },
            )
            .subscribe();
        },
        error: (err) => this.showError(err),
      });
  }

  protected logout(): void {
    this.store.dispatch(AuthActions.requestLogout());
  }

  protected openDelete(): void {
    void this.openDeleteDialog();
  }

  private showError(err: unknown): void {
    this.tuiNotificationsService
      .open(this.apiErrorService.translate(err, 'GENERAL.REQ_ERR'), {
        appearance: 'negative',
        autoClose: 5000,
        closable: true,
        label: this.translateService.instant('GENERAL.REQ_ERR'),
      })
      .subscribe();
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
