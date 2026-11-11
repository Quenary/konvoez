import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { buildInviteUrl, emailSchema, IInvite } from '@konvoez/shared';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { injectContext } from '@taiga-ui/polymorpheus';
import {
  TuiButton,
  TuiCheckbox,
  TuiDialogContext,
  TuiError,
  TuiInput,
  TuiLabel,
  TuiNotificationService,
  TuiTextfield,
} from '@taiga-ui/core';
import { TuiButtonLoading, TuiCopy } from '@taiga-ui/kit';
import { TuiForm } from '@taiga-ui/layout';
import { InvitesApiService } from '@core/api/invites-api.service';
import { ApiErrorService } from '@core/services/api-error.service';
import { PublicStore } from '@core/stores/public.store';
import {
  createZodError,
  createZodFieldValidator,
  createZodFormValidator,
} from '@shared/functions/zod-validator.function';
import {
  inviteCreateFormSchema,
  inviteDefaultTtlMinutes,
  inviteFormEmailSchema,
  inviteFormTtlSchema,
} from '@shared/schemas/forms.schema';

import { icons } from '@constants';

@Component({
  selector: 'app-invite-create-dialog',
  imports: [
    ReactiveFormsModule,
    TranslatePipe,
    TuiButton,
    TuiButtonLoading,
    TuiCheckbox,
    TuiCopy,
    TuiError,
    TuiForm,
    TuiInput,
    TuiLabel,
    TuiTextfield,
  ],
  templateUrl: './invite-create-dialog.component.html',
  styleUrl: './invite-create-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InviteCreateDialogComponent {
  public readonly context =
    injectContext<TuiDialogContext<IInvite | null, void>>();
  private readonly invitesApiService = inject(InvitesApiService);
  private readonly apiErrorService = inject(ApiErrorService);
  private readonly publicStore = inject(PublicStore);
  private readonly tuiNotificationService = inject(TuiNotificationService);
  private readonly translateService = inject(TranslateService);

  protected readonly icons = icons;
  protected readonly canSendEmail = computed(() => {
    const smtpConfigured = this.publicStore.isSmtpConfigured();
    const appUrlConfigured = this.publicStore.isAppUrlConfigured();
    return smtpConfigured && appUrlConfigured;
  });
  protected readonly loading = signal(false);
  protected readonly createdInvite = signal<IInvite | null>(null);

  protected readonly inviteUrl = computed(() => {
    const invite = this.createdInvite();
    const code = invite?.code;
    if (!invite || !code) return '';
    return (
      invite.url ??
      buildInviteUrl(window.location.origin, code, invite.email) ??
      code
    );
  });

  protected readonly form = new FormGroup(
    {
      email: new FormControl('', {
        nonNullable: true,
        validators: [createZodFieldValidator(inviteFormEmailSchema)],
      }),
      sendEmail: new FormControl(false, {
        nonNullable: true,
      }),
      ttlMinutes: new FormControl(inviteDefaultTtlMinutes, {
        nonNullable: true,
        validators: [createZodFieldValidator(inviteFormTtlSchema)],
      }),
    },
    {
      validators: [createZodFormValidator(inviteCreateFormSchema)],
    },
  );

  protected readonly errors = createZodError(this.form, inviteCreateFormSchema);

  constructor() {
    this.form.controls.sendEmail.disable({ emitEvent: false });

    let hadValidEmail = false;

    this.form.controls.email.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((rawEmail) => {
        const trimmed = (rawEmail ?? '').trim();
        const isValid =
          trimmed.length > 0 && emailSchema.safeParse(trimmed).success;

        if (isValid) {
          if (this.canSendEmail()) {
            this.form.controls.sendEmail.enable({ emitEvent: false });
            if (!hadValidEmail) {
              hadValidEmail = true;
              this.form.controls.sendEmail.setValue(true);
            }
          } else {
            this.form.controls.sendEmail.disable({ emitEvent: false });
            this.form.controls.sendEmail.setValue(false);
          }
        } else {
          hadValidEmail = false;
          if (this.form.controls.sendEmail.value) {
            this.form.controls.sendEmail.setValue(false);
          }
          this.form.controls.sendEmail.disable({ emitEvent: false });
        }
      });
  }

  protected onSubmit(): void {
    if (this.loading()) return;

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading.set(true);

    const { email, ttlMinutes, sendEmail } = this.form.getRawValue();
    const ttlMs = Number(ttlMinutes) * 60_000;
    const trimmedEmail = email.trim();

    this.invitesApiService
      .create({
        email: trimmedEmail ? trimmedEmail : null,
        ttl: ttlMs,
        sendEmail: sendEmail && !!trimmedEmail && this.canSendEmail(),
      })
      .subscribe({
        next: (invite) => {
          this.loading.set(false);
          this.createdInvite.set(invite);
          if (invite.emailSendFailed) {
            this.tuiNotificationService
              .open(
                this.translateService.instant(
                  'SETTINGS.INVITES.EMAIL_SEND_WARNING',
                ),
                { appearance: 'warning' },
              )
              .subscribe();
          }
        },
        error: (err: unknown) => {
          this.loading.set(false);
          this.tuiNotificationService
            .open(this.apiErrorService.translate(err, 'GENERAL.REQ_ERR'), {
              appearance: 'negative',
              label: this.translateService.instant('GENERAL.REQ_ERR'),
            })
            .subscribe();
        },
      });
  }

  protected close(): void {
    this.context.completeWith(this.createdInvite());
  }
}
