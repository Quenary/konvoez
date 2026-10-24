import { createActionGroup, emptyProps, props } from '@ngrx/store';
import { HttpErrorResponse } from '@angular/common/http';
import {
  IAuthLogin,
  IUserFull,
  IAuthRegister,
  IProfileUpdate,
} from '@konvoez/shared';

export const AuthActions = createActionGroup({
  source: 'AUTH',
  events: {
    initStart: emptyProps(),
    initEnd: props<{ user: IUserFull | null }>(),
    requestLogin: props<{ body: IAuthLogin }>(),
    requestLoginSuccess: props<{ user: IUserFull }>(),
    requestLoginError: props<{ error: HttpErrorResponse }>(),
    requestLogout: emptyProps(),
    requestLogoutSuccess: emptyProps(),
    requestLogoutError: props<{ error: HttpErrorResponse }>(),
    sessionExpired: emptyProps(),
    requestRegister: props<{ body: IAuthRegister }>(),
    requestRegisterSuccess: emptyProps(),
    requestRegisterError: props<{ error: HttpErrorResponse }>(),
    requestPatchUser: props<{ body: IProfileUpdate }>(),
    requestPatchUserSuccess: props<{ user: IUserFull }>(),
    requestPatchUserError: props<{ error: HttpErrorResponse }>(),
    requestDeleteSelf: props<{ fullDeletion: boolean }>(),
    requestDeleteSelfSuccess: emptyProps(),
    requestDeleteSelfError: props<{ error: HttpErrorResponse }>(),
    requestMe: emptyProps(),
    requestMeSuccess: props<{ user: IUserFull }>(),
    requestMeError: props<{ error: HttpErrorResponse }>(),
  },
});
