import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { injectContext } from '@taiga-ui/polymorpheus';
import {
  TuiButton,
  TuiDialogContext,
  TuiError,
  TuiIcon,
  TuiInput,
  TuiLabel,
  TuiNotificationService,
  TuiTextfield,
} from '@taiga-ui/core';
import { TuiButtonLoading, TuiPassword } from '@taiga-ui/kit';
import { TuiForm } from '@taiga-ui/layout';
import { TwoFactorApiService } from '@core/api/two-factor-api.service';
import { ApiErrorService } from '@core/services/api-error.service';
import {
  createZodError,
  createZodFieldValidator,
  createZodFormValidator,
} from '@shared/functions/zod-validator.function';
import { twoFactorConfirmFormSchema } from '@shared/schemas/forms.schema';
import { icons } from '@constants';

export interface ITwoFactorConfirmDialogData {
  readonly action: 'disable' | 'regenerate';
}

@Component({
  selector: 'app-two-factor-confirm-dialog',
  imports: [
    ReactiveFormsModule,
    TranslatePipe,
    TuiButton,
    TuiButtonLoading,
    TuiError,
    TuiForm,
    TuiIcon,
    TuiInput,
    TuiLabel,
    TuiPassword,
    TuiTextfield,
  ],
  templateUrl: './two-factor-confirm-dialog.component.html',
  styleUrl: './two-factor-confirm-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TwoFactorConfirmDialogComponent {
  protected readonly icons = icons;
  public readonly context =
    injectContext<
      TuiDialogContext<boolean | string[] | null, ITwoFactorConfirmDialogData>
    >();

  private readonly twoFactorApiService = inject(TwoFactorApiService);
  private readonly apiErrorService = inject(ApiErrorService);
  private readonly notificationService = inject(TuiNotificationService);
  private readonly translateService = inject(TranslateService);

  protected readonly loading = signal(false);

  protected readonly form = new FormGroup(
    {
      password: new FormControl('', {
        nonNullable: true,
        validators: [
          createZodFieldValidator(twoFactorConfirmFormSchema.shape.password),
        ],
      }),
      code: new FormControl('', {
        nonNullable: true,
        validators: [
          createZodFieldValidator(twoFactorConfirmFormSchema.shape.code),
        ],
      }),
    },
    {
      validators: [createZodFormValidator(twoFactorConfirmFormSchema)],
    },
  );
  protected readonly errors = createZodError(
    this.form,
    twoFactorConfirmFormSchema,
  );

  protected onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const { password, code } = this.form.getRawValue();
    this.loading.set(true);

    if (this.context.data.action === 'disable') {
      this.twoFactorApiService
        .disable({ password, code: code.trim() })
        .subscribe({
          next: () => {
            this.loading.set(false);
            this.context.completeWith(true);
          },
          error: (err) => {
            this.loading.set(false);
            this.notificationService
              .open(this.apiErrorService.translate(err, 'GENERAL.REQ_ERR'), {
                appearance: 'negative',
                autoClose: 5000,
                closable: true,
                label: this.translateService.instant('GENERAL.REQ_ERR'),
              })
              .subscribe();
          },
        });
    } else {
      this.twoFactorApiService
        .regenerateRecoveryCodes({ password, code: code.trim() })
        .subscribe({
          next: (res) => {
            this.loading.set(false);
            this.context.completeWith(res.recoveryCodes);
          },
          error: (err) => {
            this.loading.set(false);
            this.notificationService
              .open(this.apiErrorService.translate(err, 'GENERAL.REQ_ERR'), {
                appearance: 'negative',
                autoClose: 5000,
                closable: true,
                label: this.translateService.instant('GENERAL.REQ_ERR'),
              })
              .subscribe();
          },
        });
    }
  }
}
