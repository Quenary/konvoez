import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  ValidatorFn,
  AbstractControl,
  FormGroup,
  FormControl,
  Validators,
  ReactiveFormsModule,
} from '@angular/forms';
import { Store } from '@ngrx/store';
import { map } from 'rxjs';
import {
  usernameMinLength,
  usernameMaxLength,
  passwordMaxLength,
  passwordMinLength,
  passwordRegexp,
} from '@konvoez/common';
import { AuthActions } from '../auth.actions';
import { selectAuthLoading } from '../auth.selectors';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { IftaLabelModule } from 'primeng/iftalabel';
import { PasswordModule } from 'primeng/password';
import { Divider } from 'primeng/divider';
import { InputTextModule } from 'primeng/inputtext';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-auth-register',
  imports: [
    TranslatePipe,
    ReactiveFormsModule,
    ButtonModule,
    InputTextModule,
    PasswordModule,
    IftaLabelModule,
    Divider,
    RouterLink,
  ],
  templateUrl: './auth-register.component.html',
  styleUrl: './auth-register.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthRegisterComponent {
  private readonly store = inject(Store);

  private readonly passwordMatchValidator = (
    field1 = 'password',
    field2 = 'confirm_password',
  ): ValidatorFn => {
    return (control: AbstractControl) => {
      const form = control as FormGroup;
      const value1 = form.controls[field1].value;
      const value2 = form.controls[field2].value;
      if (value1 != value2) {
        return { passwordMatchValidator: true };
      }
      return null;
    };
  };

  protected readonly loading = this.store.selectSignal(selectAuthLoading);
  protected readonly usernameMinLength = usernameMinLength;
  protected readonly usernameMaxLength = usernameMaxLength;
  protected readonly passwordMinLength = passwordMinLength;
  protected readonly passwordMaxLength = passwordMaxLength;
  protected readonly form = new FormGroup(
    {
      username: new FormControl<string | null>(null, [Validators.required]),
      password: new FormControl<string | null>(null, [
        Validators.required,
        Validators.pattern(passwordRegexp),
      ]),
      confirm_password: new FormControl<string | null>(null, [
        Validators.required,
        Validators.pattern(passwordRegexp),
      ]),
    },
    this.passwordMatchValidator(),
  );

  protected readonly confirmPasswordError = toSignal(
    this.form.valueChanges.pipe(
      map(() => !!this.form.errors?.['passwordMatchValidator']),
    ),
  );

  public onSubmit(): void {
    if (this.form.valid) {
      this.store.dispatch(
        AuthActions.requestRegister({
          body: {
            username: this.form.value.username as string,
            password: this.form.value.password as string,
          },
        }),
      );
    }
  }
}
