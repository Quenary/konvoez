import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { IAuthLogin, IAuthLoginTwoFactor } from '@konvoez/shared';
import { Store } from '@ngrx/store';
import {
  selectAuthLoading,
  selectAuthTwoFactorPending,
  selectIsAuthorized,
} from '@core/auth/auth.selectors';
import { AuthActions } from '@core/auth/auth.actions';
import { TranslatePipe } from '@ngx-translate/core';
import { Router, RouterLink } from '@angular/router';
import {
  TuiButton,
  TuiError,
  TuiIcon,
  TuiInput,
  TuiTitle,
} from '@taiga-ui/core';
import { TuiButtonLoading, TuiPassword } from '@taiga-ui/kit';
import { TuiCardLarge, TuiForm, TuiHeader } from '@taiga-ui/layout';
import {
  createZodError,
  createZodFieldValidator,
  createZodFormValidator,
} from '@shared/functions/zod-validator.function';
import {
  authLoginFormSchema,
  authLoginTwoFactorFormSchema,
} from '@shared/schemas/forms.schema';

import { icons } from '@constants';

@Component({
  selector: 'app-auth',
  imports: [
    ReactiveFormsModule,
    TranslatePipe,
    RouterLink,
    TuiButton,
    TuiCardLarge,
    TuiError,
    TuiForm,
    TuiHeader,
    TuiIcon,
    TuiInput,
    TuiTitle,
    TuiPassword,
    TuiButtonLoading,
  ],
  templateUrl: './auth.component.html',
  styleUrl: './auth.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthComponent {
  private readonly store = inject(Store);
  private readonly router = inject(Router);

  protected readonly icons = icons;
  protected readonly loading = this.store.selectSignal(selectAuthLoading);
  protected readonly twoFactorPending = this.store.selectSignal(
    selectAuthTwoFactorPending,
  );

  protected readonly form = new FormGroup(
    {
      login: new FormControl('', {
        nonNullable: true,
        validators: [createZodFieldValidator(authLoginFormSchema.shape.login)],
      }),
      password: new FormControl('', {
        nonNullable: true,
        validators: [
          createZodFieldValidator(authLoginFormSchema.shape.password),
        ],
      }),
    },
    {
      validators: [createZodFormValidator(authLoginFormSchema)],
    },
  );
  protected readonly errors = createZodError(this.form, authLoginFormSchema);

  protected readonly twoFactorForm = new FormGroup(
    {
      code: new FormControl('', {
        nonNullable: true,
        validators: [
          createZodFieldValidator(authLoginTwoFactorFormSchema.shape.code),
        ],
      }),
    },
    {
      validators: [createZodFormValidator(authLoginTwoFactorFormSchema)],
    },
  );
  protected readonly twoFactorErrors = createZodError(
    this.twoFactorForm,
    authLoginTwoFactorFormSchema,
  );

  private readonly isAuthorized = this.store.selectSignal(selectIsAuthorized);

  constructor() {
    effect(() => {
      if (this.isAuthorized()) {
        this.router.navigate(['/']);
      }
    });
  }

  onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.store.dispatch(
      AuthActions.requestLogin({
        body: this.form.getRawValue() satisfies IAuthLogin,
      }),
    );
  }

  onTwoFactorSubmit(): void {
    if (this.twoFactorForm.invalid) {
      this.twoFactorForm.markAllAsTouched();
      return;
    }

    this.store.dispatch(
      AuthActions.requestLoginTwoFactor({
        body: this.twoFactorForm.getRawValue() satisfies IAuthLoginTwoFactor,
      }),
    );
  }

  onCancelTwoFactor(): void {
    this.twoFactorForm.reset();
    this.store.dispatch(AuthActions.cancelLoginTwoFactor());
  }
}
