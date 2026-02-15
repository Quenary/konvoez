import { createActionGroup, emptyProps, props } from '@ngrx/store';
import { ILoginBody } from './auth.interface';
import { HttpErrorResponse } from '@angular/common/http';
import { ICreateUser, IGetUser } from '../user/user.interface';

export const AuthActions = createActionGroup({
  source: 'AUTH',
  events: {
    initStart: emptyProps(),
    initEnd: props<{ user: IGetUser | null }>(),
    requestLogin: props<{ body: ILoginBody }>(),
    requestLoginSuccess: props<{ user: IGetUser }>(),
    requestLoginError: props<{ error: HttpErrorResponse }>(),
    requestLogout: emptyProps(),
    requestLogoutSuccess: emptyProps(),
    requestLogoutError: props<{ error: HttpErrorResponse }>(),
    requestRefresh: emptyProps(),
    requestRefreshSuccess: emptyProps(),
    requestRefreshError: props<{ error: HttpErrorResponse }>(),
    requestRegister: props<{ body: ICreateUser }>(),
    requestRegisterSuccess: emptyProps(),
    requestRegisterError: props<{ error: HttpErrorResponse }>(),
    requestMe: emptyProps(),
    requestMeSuccess: props<{ user: IGetUser }>(),
    requestMeError: props<{ error: HttpErrorResponse }>(),
  },
});
