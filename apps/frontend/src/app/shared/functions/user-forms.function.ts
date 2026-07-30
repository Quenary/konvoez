import {
  FormControl,
  FormGroup,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import {
  usernameMinLength,
  usernameMaxLength,
  passwordMinLength,
  passwordMaxLength,
  passwordRegexp,
  fullnameMaxLength,
  fullnameMinLength,
} from '@konvoez/shared';
import { TuiFileLike } from '@taiga-ui/kit';

export const getPasswordValidators = () => [
  Validators.required,
  Validators.minLength(passwordMinLength),
  Validators.maxLength(passwordMaxLength),
  Validators.pattern(passwordRegexp),
];

export const getAuthFormControls = () => ({
  username: new FormControl('', [
    Validators.required,
    Validators.minLength(usernameMinLength),
    Validators.maxLength(usernameMaxLength),
  ]),
  password: new FormControl('', getPasswordValidators()),
});

export const getRegisterFormControls = () => ({
  ...getAuthFormControls(),
  confirmPassword: new FormControl<string>('', getPasswordValidators()),
  fullname: new FormControl<string>('', [
    Validators.required,
    Validators.minLength(fullnameMinLength),
    Validators.maxLength(fullnameMaxLength),
  ]),
  email: new FormControl<string>('', [Validators.required, Validators.email]),
});

export const getProfileFormControls = () => ({
  ...getRegisterFormControls(),
  isChangingPassword: new FormControl<boolean>(false),
  avatar: new FormControl<string | null>(null),
  avatarFile: new FormControl<TuiFileLike | null>(null),
});

export const passwordMatchValidator: ValidatorFn = (control) => {
  const form = control as FormGroup;
  const value1 = form.controls['password'].value;
  const value2 = form.controls['confirmPassword'].value;
  if (value1 != value2) {
    return { passwordMatchValidator: true };
  }
  return null;
};
