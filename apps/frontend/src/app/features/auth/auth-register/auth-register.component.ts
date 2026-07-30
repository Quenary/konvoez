import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Store } from '@ngrx/store';
import { map } from 'rxjs';
import { AuthActions } from '../auth.actions';
import { selectAuthLoading } from '../auth.selectors';
import { TranslatePipe } from '@ngx-translate/core';
import {
  TuiButton,
  TuiError,
  TuiIcon,
  TuiInput,
  TuiNotification,
} from '@taiga-ui/core';
import { TuiButtonLoading, TuiPassword, TuiTooltip } from '@taiga-ui/kit';
import { TuiCardLarge, TuiForm, TuiHeader } from '@taiga-ui/layout';
import { RouterLink } from '@angular/router';
import { IUserCreate } from '@konvoez/shared';
import {
  getRegisterFormControls,
  passwordMatchValidator,
} from '@shared/functions/user-forms.function';

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
    TuiNotification,
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
    getRegisterFormControls(),
    passwordMatchValidator,
  );

  protected readonly confirmPasswordError = toSignal(
    this.form.valueChanges.pipe(
      map(() => !!this.form.errors?.['passwordMatchValidator']),
    ),
  );

  public onSubmit(): void {
    if (this.form.invalid) return;

    const { confirmPassword: _, ...body } = this.form.value;
    this.store.dispatch(
      AuthActions.requestRegister({
        body: body as IUserCreate,
      }),
    );
  }
}
