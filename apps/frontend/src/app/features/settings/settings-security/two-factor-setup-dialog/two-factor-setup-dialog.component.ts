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
import {
  TuiButtonLoading,
  TuiCopy,
  TuiPassword,
  TuiSensitive,
} from '@taiga-ui/kit';
import { TuiForm } from '@taiga-ui/layout';
import { TwoFactorApiService } from '@core/api/two-factor-api.service';
import { ApiErrorService } from '@core/services/api-error.service';
import { QrCodeComponent } from '@shared/components/qr-code/qr-code.component';
import {
  createZodError,
  createZodFieldValidator,
  createZodFormValidator,
} from '@shared/functions/zod-validator.function';
import {
  twoFactorEnableFormSchema,
  twoFactorSetupFormSchema,
} from '@shared/schemas/forms.schema';
import { icons } from '@constants';

@Component({
  selector: 'app-two-factor-setup-dialog',
  imports: [
    ReactiveFormsModule,
    TranslatePipe,
    TuiButton,
    TuiButtonLoading,
    TuiCopy,
    TuiError,
    TuiForm,
    TuiIcon,
    TuiInput,
    TuiLabel,
    TuiPassword,
    TuiSensitive,
    TuiTextfield,
    QrCodeComponent,
  ],
  templateUrl: './two-factor-setup-dialog.component.html',
  styleUrl: './two-factor-setup-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TwoFactorSetupDialogComponent {
  protected readonly icons = icons;
  public readonly context =
    injectContext<TuiDialogContext<string[] | null, void>>();

  private readonly twoFactorApiService = inject(TwoFactorApiService);
  private readonly apiErrorService = inject(ApiErrorService);
  private readonly notificationService = inject(TuiNotificationService);
  private readonly translateService = inject(TranslateService);

  protected readonly step = signal<1 | 2>(1);
  protected readonly loading = signal(false);
  protected readonly secret = signal<string | null>(null);
  protected readonly otpauthUri = signal<string | null>(null);
  protected readonly isSecretHidden = signal(true);

  protected toggleSecretVisibility(): void {
    this.isSecretHidden.update((v) => !v);
  }

  protected readonly passwordForm = new FormGroup(
    {
      password: new FormControl('', {
        nonNullable: true,
        validators: [
          createZodFieldValidator(twoFactorSetupFormSchema.shape.password),
        ],
      }),
    },
    {
      validators: [createZodFormValidator(twoFactorSetupFormSchema)],
    },
  );
  protected readonly passwordErrors = createZodError(
    this.passwordForm,
    twoFactorSetupFormSchema,
  );

  protected readonly codeForm = new FormGroup(
    {
      code: new FormControl('', {
        nonNullable: true,
        validators: [
          createZodFieldValidator(twoFactorEnableFormSchema.shape.code),
        ],
      }),
    },
    {
      validators: [createZodFormValidator(twoFactorEnableFormSchema)],
    },
  );
  protected readonly codeErrors = createZodError(
    this.codeForm,
    twoFactorEnableFormSchema,
  );

  protected onPasswordSubmit(): void {
    if (this.passwordForm.invalid) {
      this.passwordForm.markAllAsTouched();
      return;
    }

    const password = this.passwordForm.controls.password.value;
    this.loading.set(true);
    this.twoFactorApiService.setup({ password }).subscribe({
      next: (res) => {
        this.loading.set(false);
        this.secret.set(res.secret);
        this.otpauthUri.set(res.otpauthUri);
        this.step.set(2);
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

  protected onCodeSubmit(): void {
    if (this.codeForm.invalid) {
      this.codeForm.markAllAsTouched();
      return;
    }

    const code = this.codeForm.controls.code.value.trim();
    this.loading.set(true);
    this.twoFactorApiService.enable({ code }).subscribe({
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
