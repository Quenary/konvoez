import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Store } from '@ngrx/store';
import { AuthActions } from '../auth.actions';
import { selectAuthLoading } from '../auth.selectors';
import { TranslatePipe } from '@ngx-translate/core';
import { TuiButton, TuiError, TuiIcon, TuiInput } from '@taiga-ui/core';
import { TuiButtonLoading, TuiPassword, TuiTooltip } from '@taiga-ui/kit';
import { TuiCardLarge, TuiForm, TuiHeader } from '@taiga-ui/layout';
import { RouterLink } from '@angular/router';
import {
  emailSchema,
  fullnameSchema,
  IUserCreate,
  passwordSchema,
  usernameSchema,
} from '@konvoez/shared';
import { registerFormSchema } from '@shared/schemas/forms.schema';
import {
  createZodError,
  createZodFieldValidator,
  createZodFormValidator,
} from '@shared/functions/zod-validator.function';

@Component({
  selector: 'app-auth-register',
  imports: [
    TranslatePipe,
    ReactiveFormsModule,
    TuiButton,
    TuiCardLarge,
    TuiError,
    TuiForm,
    TuiHeader,
    TuiIcon,
    TuiInput,
    TuiTooltip,
    TuiPassword,
    RouterLink,
    TuiButtonLoading,
  ],
  templateUrl: './auth-register.component.html',
  styleUrl: './auth-register.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthRegisterComponent {
  private readonly store = inject(Store);

  protected readonly loading = this.store.selectSignal(selectAuthLoading);
  protected readonly form = new FormGroup(
    {
      username: new FormControl('', {
        nonNullable: true,
        validators: [createZodFieldValidator(usernameSchema)],
      }),
      password: new FormControl('', {
        nonNullable: true,
        validators: [createZodFieldValidator(passwordSchema)],
      }),
      confirmPassword: new FormControl('', {
        nonNullable: true,
        validators: [createZodFieldValidator(passwordSchema)],
      }),
      fullname: new FormControl('', {
        nonNullable: true,
        validators: [createZodFieldValidator(fullnameSchema)],
      }),
      email: new FormControl('', {
        nonNullable: true,
        validators: [createZodFieldValidator(emailSchema)],
      }),
    },
    {
      validators: [createZodFormValidator(registerFormSchema)],
    },
  );
  protected readonly errors = createZodError(this.form, registerFormSchema);

  public onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const { confirmPassword: _, ...body } = this.form.getRawValue();
    this.store.dispatch(
      AuthActions.requestRegister({
        body: body satisfies IUserCreate,
      }),
    );
  }
}
