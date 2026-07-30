import { Component, effect, inject, linkedSignal } from '@angular/core';
import { FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { Store } from '@ngrx/store';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  TuiError,
  TuiIcon,
  TuiInput,
  TuiLink,
  TuiNotification,
  TuiNotificationService,
  TuiTextfield,
} from '@taiga-ui/core';
import { TuiCardLarge, TuiForm, TuiHeader } from '@taiga-ui/layout';
import { TuiButton } from '@taiga-ui/core';
import { RouterLink } from '@angular/router';
import {
  TuiTooltip,
  TuiPassword,
  TuiButtonLoading,
  TuiSwitch,
  TuiFiles,
  TuiAvatar,
} from '@taiga-ui/kit';
import { AuthActions } from '@features/auth/auth.actions';
import {
  selectAuthLoading,
  selectCurrentUser,
} from '@features/auth/auth.selectors';
import {
  getPasswordValidators,
  getProfileFormControls,
  passwordMatchValidator,
} from '@shared/functions/user-forms.function';
import { IUserUpdate } from '@konvoez/shared';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { UserApiService } from '@features/user/user-api.service';
import { LowerCasePipe, NgOptimizedImage } from '@angular/common';
import { parseError } from '@shared/functions/parse-error.function';

@Component({
  selector: 'app-settings-profile',
  imports: [
    ReactiveFormsModule,
    FormsModule,
    TranslatePipe,
    LowerCasePipe,
    NgOptimizedImage,
    TuiButton,
    TuiTextfield,
    TuiCardLarge,
    TuiError,
    TuiForm,
    TuiHeader,
    TuiIcon,
    TuiFiles,
    TuiInput,
    TuiNotification,
    TuiTooltip,
    TuiPassword,
    RouterLink,
    TuiButtonLoading,
    TuiSwitch,
    TuiAvatar,
    TuiLink,
  ],
  templateUrl: './settings-profile.component.html',
  styleUrl: './settings-profile.component.scss',
})
export class SettingsProfileComponent {
  private readonly store = inject(Store);
  private readonly userApiService = inject(UserApiService);
  private readonly translateService = inject(TranslateService);
  private readonly tuiNotificationsService = inject(TuiNotificationService);

  protected readonly currentUser = this.store.selectSignal(selectCurrentUser);
  protected readonly loading = this.store.selectSignal(selectAuthLoading);
  protected readonly form = new FormGroup(getProfileFormControls(), [
    passwordMatchValidator,
  ]);
  protected readonly avatarUrl = linkedSignal<string | null>(
    () => this.currentUser()?.avatarUrl ?? null,
  );

  constructor() {
    const { password, confirmPassword } = this.form.controls;

    const onDisablePasswords = () => {
      password.disable();
      password.clearValidators();
      confirmPassword.disable();
      confirmPassword.clearValidators();
      confirmPassword.updateValueAndValidity();
      password.updateValueAndValidity();
    };

    onDisablePasswords();

    this.form.controls.isChangingPassword.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((isChangingPassword) => {
        this.form.patchValue({
          password: null,
          confirmPassword: null,
        });
        if (isChangingPassword) {
          password.enable();
          confirmPassword.enable();
          password.setValidators(getPasswordValidators());
          confirmPassword.setValidators(getPasswordValidators());
        } else {
          onDisablePasswords();
        }
      });

    effect(() => {
      const currentUser = this.currentUser();

      this.form.reset(currentUser as IUserUpdate);
      this.avatarUrl.set(currentUser?.avatarUrl ?? null);
    });

    this.form.controls.avatarFile.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((avatarFile) => {
        if (avatarFile) {
          this.userApiService.avatarUpload(avatarFile as File).subscribe({
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
        }
      });
  }

  protected onSubmit(): void {
    if (this.form.invalid) return;

    const id = this.currentUser()?.id as number;

    const values = this.form.value;

    const body: IUserUpdate = {
      username: values.username as string,
      fullname: values.fullname as string,
      email: values.email as string,
      avatar: values.avatar as string,
    };

    if (values.isChangingPassword) {
      body.password = values.password as string;
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
