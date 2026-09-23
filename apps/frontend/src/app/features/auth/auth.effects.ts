import { inject, Injectable } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { AuthActions } from './auth.actions';
import { catchError, filter, finalize, map, of, switchMap, tap } from 'rxjs';
import { AuthApiService } from './auth-api.service';
import { UsersApiService } from '../users/users-api.service';
import { UsersStore } from '../users/users.store';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { parseError } from '@shared/functions/parse-error.function';
import { VoiceRoomSocketToken } from '@core/tokens/voice-room-socket.token';
import { PushNotificationService } from '@core/services/push-notification.service';
import { Store } from '@ngrx/store';
import { selectIsAuthorized } from './auth.selectors';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TuiNotificationService } from '@taiga-ui/core';
import { IUser } from '@konvoez/shared';

@Injectable()
export class AuthEffects {
  private readonly store = inject(Store);
  private readonly actions$ = inject(Actions);
  private readonly authApiService = inject(AuthApiService);
  private readonly usersApiService = inject(UsersApiService);
  private readonly usersStore = inject(UsersStore);
  private readonly router = inject(Router);
  private readonly translateService = inject(TranslateService);
  private readonly socket = inject(VoiceRoomSocketToken);
  private readonly tuiNotificationsService = inject(TuiNotificationService);
  private readonly pushNotificationService = inject(PushNotificationService);

  constructor() {
    this.store
      .select(selectIsAuthorized)
      .pipe(
        takeUntilDestroyed(),
        finalize(() => {
          this.socket.disconnect();
        }),
      )
      .subscribe((auth) => {
        if (auth) {
          this.socket.connect();
        } else {
          this.socket.disconnect();
        }
      });
  }

  readonly init$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AuthActions.initStart),
      switchMap(() =>
        this.authApiService.me().pipe(
          map((user) => AuthActions.initEnd({ user })),
          catchError(() => of(AuthActions.initEnd({ user: null }))),
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

  readonly syncPushSubscription$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(AuthActions.initEnd, AuthActions.requestLoginSuccess),
        map((action) => action.user),
        filter((user): user is IUser => user != null),
        switchMap(() =>
          this.pushNotificationService.syncExistingSubscription(),
        ),
      ),
    { dispatch: false },
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
          this.usersStore.clear();
          this.router.navigate(['/auth']);
        }),
      ),
    { dispatch: false },
  );

  readonly requestRegister$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AuthActions.requestRegister),
      switchMap((action) =>
        this.authApiService.register(action.body).pipe(
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

  readonly requestPatchUser$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AuthActions.requestPatchUser),
      switchMap(({ id, body }) =>
        this.usersApiService.patch(id, body).pipe(
          map((user) => AuthActions.requestPatchUserSuccess({ user })),
          catchError((error) =>
            of(AuthActions.requestPatchUserError({ error })),
          ),
        ),
      ),
    ),
  );

  readonly showError$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(
          AuthActions.requestLoginError,
          AuthActions.requestLogoutError,
          AuthActions.requestRegisterError,
          AuthActions.requestPatchUserError,
        ),
        tap(({ error }) => {
          this.tuiNotificationsService
            .open(parseError(error), {
              appearance: 'negative',
              autoClose: 5000,
              closable: true,
              label: this.translateService.instant('GENERAL.REQ_ERR'),
            })
            .subscribe();
        }),
      ),
    { dispatch: false },
  );
}
