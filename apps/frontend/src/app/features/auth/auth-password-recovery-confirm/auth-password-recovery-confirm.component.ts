import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  emailSchema,
  passwordRecoveryCodeSchema,
  passwordRecoveryConfirmSchema,
  passwordSchema,
} from '@konvoez/shared';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  TuiButton,
  TuiError,
  TuiIcon,
  TuiInput,
  TuiNotificationService,
  TuiTitle,
} from '@taiga-ui/core';
import { TuiButtonLoading, TuiPassword } from '@taiga-ui/kit';
import { TuiCardLarge, TuiForm, TuiHeader } from '@taiga-ui/layout';
import {
  createZodError,
  createZodFieldValidator,
  createZodFormValidator,
} from '@shared/functions/zod-validator.function';
import { parseError } from '@shared/functions/parse-error.function';
import { AuthApiService } from '../auth-api.service';
import { finalize } from 'rxjs';
import * as z from 'zod';

const confirmFormSchema = passwordRecoveryConfirmSchema
  .extend({
    confirmPassword: passwordSchema,
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'VALIDATION.PASSWORD_MISMATCH',
    path: ['confirmPassword'],
  });

@Component({
  selector: 'app-auth-password-recovery-confirm',
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
  templateUrl: './auth-password-recovery-confirm.component.html',
  styleUrl: './auth-password-recovery-confirm.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthPasswordRecoveryConfirmComponent {
  private readonly authApi = inject(AuthApiService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly notifications = inject(TuiNotificationService);
  private readonly translate = inject(TranslateService);

  protected readonly loading = signal(false);

  protected readonly form = new FormGroup(
    {
      email: new FormControl('', {
        nonNullable: true,
        validators: [createZodFieldValidator(emailSchema)],
      }),
      code: new FormControl('', {
        nonNullable: true,
        validators: [createZodFieldValidator(passwordRecoveryCodeSchema)],
      }),
      password: new FormControl('', {
        nonNullable: true,
        validators: [createZodFieldValidator(passwordSchema)],
      }),
      confirmPassword: new FormControl('', {
        nonNullable: true,
        validators: [createZodFieldValidator(passwordSchema)],
      }),
    },
    { validators: [createZodFormValidator(confirmFormSchema)] },
  );
  protected readonly errors = createZodError(
    this.form,
    confirmFormSchema as z.ZodType,
  );

  constructor() {
    const email = this.route.snapshot.queryParams['email'];
    if (typeof email === 'string' && email) {
      this.form.controls.email.setValue(email);
    }
  }

  protected onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const { email, code, password } = this.form.getRawValue();
    this.loading.set(true);
    this.authApi
      .confirmPasswordRecovery({ email, code, password })
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: () => {
          this.notifications
            .open(this.translate.instant('AUTH.PASSWORD_RECOVERY.SUCCESS'), {
              appearance: 'positive',
              autoClose: 5000,
              closable: true,
            })
            .subscribe();
          void this.router.navigate(['/auth']);
        },
        error: (err) => {
          this.notifications
            .open(parseError(err), {
              appearance: 'negative',
              autoClose: 5000,
              closable: true,
              label: this.translate.instant('GENERAL.REQ_ERR'),
            })
            .subscribe();
        },
      });
  }
}
