import { createReducer, on } from '@ngrx/store';
import { AuthActions } from './auth.actions';
import { IUser } from '@konvoez/shared';

export interface IAuthState {
  init: boolean;
  loading: boolean;
  user: IUser | null;
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
  // Login
  on(AuthActions.requestLogin, (state) => ({
    ...state,
    loading: true,
  })),
  on(AuthActions.requestLoginSuccess, (state, payload) => ({
    ...state,
    loading: false,
    user: payload.user,
  })),
  on(AuthActions.requestLoginError, (state) => ({
    ...state,
    loading: false,
    user: null,
  })),
  // Logout
  on(AuthActions.requestLogout, (state) => ({
    ...state,
    loading: true,
  })),
  on(
    AuthActions.requestLogoutSuccess,
    AuthActions.requestLogoutError,
    (state) => ({
      ...state,
      loading: false,
      user: null,
    }),
  ),
  // Register
  on(AuthActions.requestRegister, (state) => ({
    ...state,
    loading: true,
  })),
  on(
    AuthActions.requestRegisterSuccess,
    AuthActions.requestRegisterError,
    (state) => ({
      ...state,
      loading: false,
    }),
  ),
  // Patch
  on(AuthActions.requestPatchUser, (state) => ({
    ...state,
    loading: true,
  })),
  on(AuthActions.requestPatchUserSuccess, (state, { user }) => ({
    ...state,
    user,
    loading: false,
  })),
  on(AuthActions.requestPatchUserError, (state) => ({
    ...state,
    loading: false,
  })),
);
