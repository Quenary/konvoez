import { inject, Injectable } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { AuthActions } from './auth.actions';
import { catchError, map, of, switchMap, tap } from 'rxjs';
import { AuthApiService } from './auth-api.service';
import { UserApiService } from '../user/user-api.service';
import { Router } from '@angular/router';
import { AvatarsApiService } from '../avatars/avatars-api.service';
import { MessageService } from 'primeng/api';
import { TranslateService } from '@ngx-translate/core';
import { parseError } from '@shared/functions/parse-error.function';

@Injectable()
export class AuthEffects {
  private readonly actions$ = inject(Actions);
  private readonly authApiService = inject(AuthApiService);
  private readonly userApiService = inject(UserApiService);
  private readonly router = inject(Router);
  private readonly avatarApiService = inject(AvatarsApiService);
  private readonly messageService = inject(MessageService);
  private readonly translateService = inject(TranslateService);

  readonly init$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AuthActions.initStart),
      switchMap(() =>
        this.authApiService.me().pipe(
          map((user) => AuthActions.initEnd({ user })),
          catchError((error) => of(AuthActions.initEnd({ user: null }))),
        ),
      ),
    ),
  );

  readonly requestLogin$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AuthActions.requestLogin),
      switchMap((action) =>
        this.authApiService.login(action.body).pipe(
          map((user) => AuthActions.requestLoginSuccess({ user })),
          catchError((error) => of(AuthActions.requestLoginError({ error }))),
        ),
      ),
    ),
  );

  readonly requestLoginSuccess$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(AuthActions.requestLoginSuccess),
        tap(() => {
          this.router.navigate(['/']);
        }),
      ),
    { dispatch: false },
  );

  readonly requestLogout$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AuthActions.requestLogout),
      switchMap(() =>
        this.authApiService.logout().pipe(
          map(() => AuthActions.requestLogoutSuccess()),
          catchError((error) => of(AuthActions.requestLogoutError({ error }))),
        ),
      ),
    ),
  );

  readonly logoutEnd$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(
          AuthActions.requestLogoutSuccess,
          AuthActions.requestLogoutError,
        ),
        tap(() => {
          this.router.navigate(['/auth']);
        }),
      ),
    { dispatch: false },
  );

  readonly requestRegister$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AuthActions.requestRegister),
      switchMap((action) =>
        this.userApiService.create(action.body).pipe(
          map(() => AuthActions.requestRegisterSuccess()),
          catchError((error) =>
            of(AuthActions.requestRegisterError({ error })),
          ),
        ),
      ),
    ),
  );

  readonly requestRegisterSuccess = createEffect(
    () =>
      this.actions$.pipe(
        ofType(AuthActions.requestRegisterSuccess),
        tap(() => this.router.navigate(['/auth'])),
      ),
    { dispatch: false },
  );

  readonly uploadAvatar$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AuthActions.uploadAvatar),
      switchMap(({ file }) =>
        this.avatarApiService.uploadAvatar(file).pipe(
          map((avatar) => AuthActions.uploadAvatarSuccess({ avatar })),
          catchError((error) => of(AuthActions.uploadAvatarError({ error }))),
        ),
      ),
    ),
  );

  readonly showError$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(
          AuthActions.requestLoginError,
          AuthActions.requestMeError,
          AuthActions.requestLogoutError,
          AuthActions.requestLoginError,
          AuthActions.uploadAvatarError,
        ),
        tap((action) => {
          this.messageService.add({
            severity: 'error',
            summary: this.translateService.instant('GENERAL.REQ_ERR'),
            detail: parseError(action.error.message),
          });
        }),
      ),
    { dispatch: false },
  );
}
