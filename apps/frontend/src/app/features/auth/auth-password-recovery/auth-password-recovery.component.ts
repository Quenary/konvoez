import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { emailSchema, passwordRecoveryRequestSchema } from '@konvoez/shared';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  TuiButton,
  TuiError,
  TuiIcon,
  TuiInput,
  TuiNotificationService,
  TuiTitle,
} from '@taiga-ui/core';
import { TuiButtonLoading } from '@taiga-ui/kit';
import { TuiCardLarge, TuiForm, TuiHeader } from '@taiga-ui/layout';
import {
  createZodError,
  createZodFieldValidator,
  createZodFormValidator,
} from '@shared/functions/zod-validator.function';
import { parseError } from '@shared/functions/parse-error.function';
import { AuthApiService } from '@core/api/auth-api.service';
import { finalize } from 'rxjs';

@Component({
  selector: 'app-auth-password-recovery',
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
    TuiButtonLoading,
  ],
  templateUrl: './auth-password-recovery.component.html',
  styleUrl: './auth-password-recovery.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthPasswordRecoveryComponent {
  private readonly authApi = inject(AuthApiService);
  private readonly router = inject(Router);
  private readonly notifications = inject(TuiNotificationService);
  private readonly translate = inject(TranslateService);

  protected readonly loading = signal(false);

  protected readonly form = new FormGroup(
    {
      email: new FormControl('', {
        nonNullable: true,
        validators: [createZodFieldValidator(emailSchema)],
      }),
    },
    { validators: [createZodFormValidator(passwordRecoveryRequestSchema)] },
  );
  protected readonly errors = createZodError(
    this.form,
    passwordRecoveryRequestSchema,
  );

  protected onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const body = this.form.getRawValue();
    this.loading.set(true);
    this.authApi
      .requestPasswordRecovery(body)
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: () => {
          this.notifications
            .open(this.translate.instant('AUTH.PASSWORD_RECOVERY.CODE_SENT'), {
              appearance: 'positive',
              autoClose: 5000,
              closable: true,
            })
            .subscribe();
          void this.router.navigate(['/auth/password-recovery/confirm'], {
            queryParams: { email: body.email },
          });
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
