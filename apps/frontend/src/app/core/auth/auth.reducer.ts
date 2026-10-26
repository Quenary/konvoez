import { createReducer, on } from '@ngrx/store';
import { AuthActions } from './auth.actions';
import { IUserFull } from '@konvoez/shared';

export interface IAuthState {
  init: boolean;
  loading: boolean;
  twoFactorPending: boolean;
  user: IUserFull | null;
}

export const initialState: IAuthState = {
  init: false,
  loading: false,
  twoFactorPending: false,
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
    twoFactorPending: false,
  })),
  on(AuthActions.requestLoginSuccess, (state, payload) => ({
    ...state,
    loading: false,
    twoFactorPending: false,
    user: payload.user,
  })),
  on(AuthActions.requestLoginError, (state) => ({
    ...state,
    loading: false,
    twoFactorPending: false,
    user: null,
  })),
  // Two-factor login
  on(AuthActions.requestLoginTwoFactorRequired, (state) => ({
    ...state,
    loading: false,
    twoFactorPending: true,
  })),
  on(AuthActions.requestLoginTwoFactor, (state) => ({
    ...state,
    loading: true,
  })),
  on(AuthActions.requestLoginTwoFactorSuccess, (state, payload) => ({
    ...state,
    loading: false,
    twoFactorPending: false,
    user: payload.user,
  })),
  on(AuthActions.requestLoginTwoFactorError, (state, { error }) => ({
    ...state,
    loading: false,
    twoFactorPending: error.status === 401 ? false : state.twoFactorPending,
  })),
  on(AuthActions.cancelLoginTwoFactor, (state) => ({
    ...state,
    twoFactorPending: false,
  })),
  on(AuthActions.setTwoFactorEnabled, (state, { enabled }) => ({
    ...state,
    user: state.user ? { ...state.user, twoFactorEnabled: enabled } : null,
  })),
  // Logout
  on(AuthActions.requestLogout, (state) => ({
    ...state,
    loading: true,
  })),
  on(
    AuthActions.requestLogoutSuccess,
    AuthActions.requestLogoutError,
    AuthActions.sessionExpired,
    (state) => ({
      ...state,
      loading: false,
      twoFactorPending: false,
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
  // Delete self
  on(AuthActions.requestDeleteSelf, (state) => ({
    ...state,
    loading: true,
  })),
  on(AuthActions.requestDeleteSelfSuccess, (state) => ({
    ...state,
    loading: false,
  })),
  on(AuthActions.requestDeleteSelfError, (state) => ({
    ...state,
    loading: false,
  })),
);
