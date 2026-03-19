import { createReducer, on } from '@ngrx/store';
import { IGetUser } from '../user/user.interface';
import { AuthActions } from './auth.actions';

export interface IAuthState {
  init: boolean;
  loading: boolean;
  user: IGetUser | null;
}

export const initialState: IAuthState = {
  init: false,
  loading: false,
  user: null,
};

export const authReducer = createReducer(
  initialState,
  on(AuthActions.initEnd, (state, payload) => ({
    ...state,
    init: true,
    user: payload.user,
  })),
  on(AuthActions.requestLoginSuccess, (state, payload) => ({
    ...state,
    loading: false,
    user: payload.user,
  })),

  on(AuthActions.requestMeSuccess, (state, payload) => ({
    ...state,
    loading: false,
    user: payload.user,
  })),
  on(AuthActions.requestMeError, (state, payload) => ({
    ...state,
    loading: false,
    user: null,
  })),
  on(
    AuthActions.requestLogoutSuccess,
    AuthActions.requestLogoutError,
    (state, payload) => ({
      ...state,
      loading: false,
      user: null,
    }),
  ),
  on(
    AuthActions.requestLoginError,
    AuthActions.requestRegisterSuccess,
    AuthActions.requestRegisterError,
    (state, payload) => ({
      ...state,
      loading: false,
    }),
  ),
  on(AuthActions.uploadAvatarSuccess, (state, payload) => ({
    ...state,
    user: {
      ...(state.user as IGetUser),
      avatar: payload.avatar,
    },
  })),
);
