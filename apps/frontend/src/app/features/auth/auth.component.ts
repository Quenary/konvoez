import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
} from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { ILoginBody } from './auth.interface';
import { Store } from '@ngrx/store';
import { selectAuthLoading, selectIsAuthorized } from './auth.selectors';
import { AuthActions } from './auth.actions';
import { TranslatePipe } from '@ngx-translate/core';
import { Router, RouterLink } from '@angular/router';
import {
  TuiButton,
  TuiError,
  TuiIcon,
  TuiInput,
  TuiNotification,
  TuiTitle,
} from '@taiga-ui/core';
import { TuiButtonLoading, TuiPassword } from '@taiga-ui/kit';
import { TuiCardLarge, TuiForm, TuiHeader } from '@taiga-ui/layout';
import { getAuthFormControls } from '@shared/functions/user-forms.function';

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
    TuiNotification,
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

  protected readonly loading = this.store.selectSignal(selectAuthLoading);
  protected readonly form = new FormGroup(getAuthFormControls());

  private readonly isAuthorized = this.store.selectSignal(selectIsAuthorized);

  constructor() {
    effect(() => {
      if (this.isAuthorized()) {
        this.router.navigate(['/']);
      }
    });
  }

  onSubmit(): void {
    if (this.form.invalid) return;

    this.store.dispatch(
      AuthActions.requestLogin({
        body: this.form.value as ILoginBody,
      }),
    );
  }
}
