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
  // Login
  on(AuthActions.requestLogin, (state, payload) => ({
    ...state,
    loading: true,
  })),
  on(AuthActions.requestLoginSuccess, (state, payload) => ({
    ...state,
    loading: false,
    user: payload.user,
  })),
  on(AuthActions.requestLoginError, (state, payload) => ({
    ...state,
    loading: false,
    user: null,
  })),
  // Request current user
  on(AuthActions.requestMe, (state, payload) => ({ ...state, loading: true })),
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
  // Logout
  on(AuthActions.requestLogout, (state, payload) => ({
    ...state,
    loading: true,
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
  // Register
  on(AuthActions.requestRegister, (state, payload) => ({
    ...state,
    loading: true,
  })),
  on(
    AuthActions.requestRegisterSuccess,
    AuthActions.requestRegisterError,
    (state, payload) => ({
      ...state,
      loading: false,
    }),
  ),
  // Avatar
  on(AuthActions.uploadAvatar, (state, payload) => ({
    ...state,
    loading: true,
  })),
  on(AuthActions.uploadAvatarSuccess, (state, payload) => ({
    ...state,
    loading: false,
    user: {
      ...(state.user as IGetUser),
      avatar: payload.avatar,
    },
  })),
  on(AuthActions.uploadAvatarError, (state, payload) => ({
    ...state,
    loading: false,
  })),
);
