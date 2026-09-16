import {
  ChangeDetectionStrategy,
  Component,
  computed,
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
import { ActivatedRoute, RouterLink } from '@angular/router';
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
import { PublicApiService } from '@core/services/public-api.service';
import { catchError, firstValueFrom, of } from 'rxjs';
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
  private readonly publicApiService = inject(PublicApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly tuiNotificationsService = inject(TuiNotificationService);
  private readonly translateService = inject(TranslateService);

  protected readonly publicSettings = resource({
    loader: () =>
      firstValueFrom(
        this.publicApiService.getSettings().pipe(
          catchError((err) => {
            this.tuiNotificationsService
              .open(parseError(err), {
                appearance: 'negative',
                autoClose: 5000,
                closable: true,
                label: this.translateService.instant('GENERAL.REQ_ERR'),
              })
              .subscribe();
            return of({
              isOwnerSetupRequired: false,
              inviteOnlySignUp: false,
            });
          }),
        ),
      ),
    defaultValue: {
      isOwnerSetupRequired: false,
      inviteOnlySignUp: false,
    },
  });

  protected readonly isOwnerSetupRequired = computed(
    () => this.publicSettings.value().isOwnerSetupRequired,
  );
  protected readonly inviteOnlySignUp = computed(
    () => this.publicSettings.value().inviteOnlySignUp,
  );

  protected readonly loading = this.store.selectSignal(selectAuthLoading);
  protected readonly form = new FormGroup(
    {
      setupToken: new FormControl('', {
        nonNullable: true,
      }),
      inviteCode: new FormControl('', {
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
          getRegisterFormSchema({
            isOwnerSetupRequired: this.isOwnerSetupRequired(),
            inviteOnlySignUp: this.inviteOnlySignUp(),
          }),
        ),
      ],
    },
  );
  protected readonly errors = createZodError(this.form, () =>
    getRegisterFormSchema({
      isOwnerSetupRequired: this.isOwnerSetupRequired(),
      inviteOnlySignUp: this.inviteOnlySignUp(),
    }),
  );

  constructor() {
    const queryParams = this.route.snapshot.queryParams;
    if (queryParams['code']) {
      this.form.controls.inviteCode.setValue(queryParams['code']);
    }
    if (queryParams['email']) {
      this.form.controls.email.setValue(queryParams['email']);
    }

    effect(() => {
      this.publicSettings.value();
      this.form.updateValueAndValidity();
    });
  }

  public onSubmit(): void {
    if (this.publicSettings.isLoading()) {
      return;
    }

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const {
      confirmPassword: _,
      setupToken,
      inviteCode,
      ...body
    } = this.form.getRawValue();
    const payload: IUserCreate = {
      ...body,
      ...(this.isOwnerSetupRequired() && setupToken ? { setupToken } : {}),
      ...(!this.isOwnerSetupRequired() && inviteCode ? { inviteCode } : {}),
    };

    this.store.dispatch(
      AuthActions.requestRegister({
        body: payload satisfies IUserCreate,
      }),
    );
  }
}
