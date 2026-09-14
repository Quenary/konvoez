import { createActionGroup, emptyProps, props } from '@ngrx/store';
import { HttpErrorResponse } from '@angular/common/http';
import { IAuthLogin, IUser, IUserCreate, IUserUpdate } from '@konvoez/shared';

export const AuthActions = createActionGroup({
  source: 'AUTH',
  events: {
    initStart: emptyProps(),
    initEnd: props<{ user: IUser | null }>(),
    requestLogin: props<{ body: IAuthLogin }>(),
    requestLoginSuccess: props<{ user: IUser }>(),
    requestLoginError: props<{ error: HttpErrorResponse }>(),
    requestLogout: emptyProps(),
    requestLogoutSuccess: emptyProps(),
    requestLogoutError: props<{ error: HttpErrorResponse }>(),
    requestRegister: props<{ body: IUserCreate }>(),
    requestRegisterSuccess: emptyProps(),
    requestRegisterError: props<{ error: HttpErrorResponse }>(),
    requestPatchUser: props<{ id: number; body: IUserUpdate }>(),
    requestPatchUserSuccess: props<{ user: IUser }>(),
    requestPatchUserError: props<{ error: HttpErrorResponse }>(),
    requestMe: emptyProps(),
    requestMeSuccess: props<{ user: IUser }>(),
    requestMeError: props<{ error: HttpErrorResponse }>(),
  },
});
