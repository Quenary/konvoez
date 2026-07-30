import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { TInterfaceToForm } from '@shared/types/interface-to-form.type';
import { ILoginBody } from './auth.interface';
import { Store } from '@ngrx/store';
import { selectAuthLoading } from './auth.selectors';
import { AuthActions } from './auth.actions';
import { TranslatePipe } from '@ngx-translate/core';
import { RouterLink } from '@angular/router';
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

  protected readonly loading = this.store.selectSignal(selectAuthLoading);
  protected readonly form = new FormGroup<TInterfaceToForm<ILoginBody>>({
    username: new FormControl(null, [Validators.required]),
    password: new FormControl(null, [Validators.required]),
  });

  onSubmit(): void {
    if (this.form.invalid) return;

    this.store.dispatch(
      AuthActions.requestLogin({
        body: this.form.value as ILoginBody,
      }),
    );
  }
}
