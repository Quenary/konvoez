import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { IInvite } from '@konvoez/shared';
import { TranslatePipe } from '@ngx-translate/core';
import { injectContext } from '@taiga-ui/polymorpheus';
import {
  TuiButton,
  TuiDialogContext,
  TuiError,
  TuiInput,
  TuiLabel,
  TuiTextfield,
} from '@taiga-ui/core';
import { TuiButtonLoading, TuiCopy } from '@taiga-ui/kit';
import { TuiForm } from '@taiga-ui/layout';
import { InvitesApiService } from '../invites-api.service';
import { parseError } from '@shared/functions/parse-error.function';
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

@Component({
  selector: 'app-invite-create-dialog',
  imports: [
    ReactiveFormsModule,
    TranslatePipe,
    TuiButton,
    TuiButtonLoading,
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

  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly createdInvite = signal<IInvite | null>(null);

  protected readonly inviteUrl = computed(() => {
    const invite = this.createdInvite();
    if (!invite) return '';
    const url = new URL('/auth/register', window.location.origin);
    url.searchParams.set('code', invite.code);
    if (invite.email) {
      url.searchParams.set('email', invite.email);
    }
    return url.toString();
  });

  protected readonly form = new FormGroup(
    {
      email: new FormControl('', {
        nonNullable: true,
        validators: [createZodFieldValidator(inviteFormEmailSchema)],
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

  protected onSubmit(): void {
    if (this.loading()) return;

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    const { email, ttlMinutes } = this.form.getRawValue();
    const ttlMs = Number(ttlMinutes) * 60_000;

    this.invitesApiService
      .create({
        email: email.trim() ? email.trim() : null,
        ttl: ttlMs,
      })
      .subscribe({
        next: (invite) => {
          this.loading.set(false);
          this.createdInvite.set(invite);
        },
        error: (err) => {
          this.loading.set(false);
          this.error.set(parseError(err) ?? null);
        },
      });
  }

  protected close(): void {
    this.context.completeWith(this.createdInvite());
  }
}
