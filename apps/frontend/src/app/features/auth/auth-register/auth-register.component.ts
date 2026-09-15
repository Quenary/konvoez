import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  resource,
} from '@angular/core';

import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Store } from '@ngrx/store';
import { AuthActions } from '../auth.actions';
import { selectAuthLoading } from '../auth.selectors';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  TuiButton,
  TuiError,
  TuiIcon,
  TuiInput,
  TuiNotificationService,
} from '@taiga-ui/core';
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
import { getRegisterFormSchema } from '@shared/schemas/forms.schema';
import {
  createZodError,
  createZodFieldValidator,
  createZodFormValidator,
} from '@shared/functions/zod-validator.function';
import { AuthApiService } from '../auth-api.service';
import { catchError, firstValueFrom, map, of } from 'rxjs';
import { parseError } from '@shared/functions/parse-error.function';

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
  private readonly authApiService = inject(AuthApiService);
  private readonly tuiNotificationsService = inject(TuiNotificationService);
  private readonly translateService = inject(TranslateService);

  protected readonly isOwnerSetupRequired = resource({
    loader: () =>
      firstValueFrom(
        this.authApiService.getSetupStatus().pipe(
          map((res) => res.isOwnerSetupRequired),
          catchError((err) => {
            this.tuiNotificationsService
              .open(parseError(err), {
                appearance: 'negative',
                autoClose: 5000,
                closable: true,
                label: this.translateService.instant('GENERAL.REQ_ERR'),
              })
              .subscribe();
            return of(false);
          }),
        ),
      ),
    defaultValue: false,
  });

  protected readonly loading = this.store.selectSignal(selectAuthLoading);
  protected readonly form = new FormGroup(
    {
      setupToken: new FormControl('', {
        nonNullable: true,
      }),
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
      validators: [
        createZodFormValidator(() =>
          getRegisterFormSchema(this.isOwnerSetupRequired.value()),
        ),
      ],
    },
  );
  protected readonly errors = createZodError(this.form, () =>
    getRegisterFormSchema(this.isOwnerSetupRequired.value()),
  );

  constructor() {
    effect(() => {
      this.isOwnerSetupRequired.value();
      this.form.updateValueAndValidity();
    });
  }

  public onSubmit(): void {
    if (this.isOwnerSetupRequired.isLoading()) {
      return;
    }

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const { confirmPassword: _, setupToken, ...body } = this.form.getRawValue();
    const payload: IUserCreate = {
      ...body,
      ...(this.isOwnerSetupRequired.value() && setupToken
        ? { setupToken }
        : {}),
    };

    this.store.dispatch(
      AuthActions.requestRegister({
        body: payload satisfies IUserCreate,
      }),
    );
  }
}
