import { Component, effect, inject, linkedSignal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Store } from '@ngrx/store';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  TuiButton,
  TuiError,
  TuiInput,
  TuiLink,
  TuiNotificationService,
  TuiTextfield,
} from '@taiga-ui/core';
import { TuiCardLarge, TuiForm, TuiHeader } from '@taiga-ui/layout';
import { TuiSwitch, TuiFiles, TuiAvatar, TuiFileLike } from '@taiga-ui/kit';
import { AuthActions } from '@features/auth/auth.actions';
import { selectCurrentUser } from '@features/auth/auth.selectors';
import {
  emailSchema,
  fullnameSchema,
  IUserUpdate,
  passwordSchema,
  usernameSchema,
} from '@konvoez/shared';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { UsersApiService } from '@features/users/users-api.service';
import { LowerCasePipe, NgOptimizedImage } from '@angular/common';
import { parseError } from '@shared/functions/parse-error.function';
import {
  createZodError,
  createZodFieldValidator,
  createZodFormValidator,
} from '@shared/functions/zod-validator.function';
import { getProfileFormSchema } from '@shared/schemas/forms.schema';

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
  ],
  templateUrl: './settings-profile.component.html',
  styleUrl: './settings-profile.component.scss',
})
export class SettingsProfileComponent {
  private readonly store = inject(Store);
  private readonly usersApiService = inject(UsersApiService);
  private readonly translateService = inject(TranslateService);
  private readonly tuiNotificationsService = inject(TuiNotificationService);

  protected readonly currentUser = this.store.selectSignal(selectCurrentUser);
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
        this.usersApiService.avatarUpload(avatarFile as File).subscribe({
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

    const id = this.currentUser()?.id as number;
    const values = this.form.getRawValue();
    const body: IUserUpdate = {
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
        id,
        body,
      }),
    );
  }

  protected logout(): void {
    this.store.dispatch(AuthActions.requestLogout());
  }
}
