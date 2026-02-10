import { inject, Injectable } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { AuthActions } from './auth.actions';
import { catchError, map, of, switchMap, tap } from 'rxjs';
import { AuthApiService } from './auth-api.service';
import { UserApiService } from '../user/user-api.service';
import { Router } from '@angular/router';

@Injectable()
export class AuthEffects {
  private readonly actions$ = inject(Actions);
  private readonly store = inject(Store);
  private readonly authApiService = inject(AuthApiService);
  private readonly userApiService = inject(UserApiService);
  private readonly router = inject(Router);

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
        ofType(AuthActions.requestLogoutSuccess, AuthActions.requestLogoutError),
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
          catchError((error) => of(AuthActions.requestRegisterError({ error }))),
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
}
