import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { TInterfaceToForm } from '@shared/types/interface-to-form.type';
import { ILoginBody } from './auth.interface';
import { ButtonModule } from 'primeng/button';
import { Store } from '@ngrx/store';
import { selectAuthLoading } from './auth.selectors';
import { AuthActions } from './auth.actions';
import { IftaLabelModule } from 'primeng/iftalabel';
import { PasswordModule } from 'primeng/password';
import { TranslatePipe } from '@ngx-translate/core';
import { InputTextModule } from 'primeng/inputtext';
import { RouterLink } from '@angular/router';
import { TuiAnimated } from '@taiga-ui/cdk';
import {
  TuiButton,
  TuiError,
  TuiIcon,
  TuiInput,
  TuiNotification,
  TuiTitle,
} from '@taiga-ui/core';
import { TuiSegmented, TuiSwitch, TuiTooltip } from '@taiga-ui/kit';
import {
  TuiCardLarge,
  TuiElasticContainer,
  TuiForm,
  TuiHeader,
} from '@taiga-ui/layout';

@Component({
  selector: 'app-auth',
  imports: [
    ReactiveFormsModule,
    ButtonModule,
    IftaLabelModule,
    PasswordModule,
    TranslatePipe,
    InputTextModule,
    RouterLink,

    //
    TuiAnimated,
    TuiButton,
    TuiCardLarge,
    TuiElasticContainer,
    TuiError,
    TuiForm,
    TuiHeader,
    TuiIcon,
    TuiInput,
    TuiNotification,
    TuiSegmented,
    TuiSwitch,
    TuiTitle,
    TuiTooltip,
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
    if (this.form.valid) {
      this.store.dispatch(
        AuthActions.requestLogin({
          body: this.form.value as ILoginBody,
        }),
      );
    }
  }
}
