import { describe, expect, it } from 'vitest';
import type { IUserFull } from '@konvoez/shared';
import { AuthActions } from './auth.actions';
import { authReducer, initialState, type IAuthState } from './auth.reducer';

describe('authReducer', () => {
  const dummyUser: IUserFull = {
    id: 1,
    username: 'alice',
    fullname: 'Alice Smith',
    email: 'alice@example.com',
    avatar: null,
    avatarUrl: null,
    isOwner: false,
    roles: [],
    permissions: [],
    createdAt: new Date(),
    updatedAt: null,
    twoFactorEnabled: false,
  };

  it('has initial twoFactorPending as false', () => {
    const state = authReducer(undefined, { type: 'INIT' });
    expect(state.twoFactorPending).toBe(false);
  });

  it('sets twoFactorPending on requestLoginTwoFactorRequired', () => {
    const state = authReducer(
      initialState,
      AuthActions.requestLoginTwoFactorRequired(),
    );
    expect(state.twoFactorPending).toBe(true);
    expect(state.loading).toBe(false);
  });

  it('clears twoFactorPending on cancelLoginTwoFactor', () => {
    const pendingState: IAuthState = {
      ...initialState,
      twoFactorPending: true,
    };
    const state = authReducer(pendingState, AuthActions.cancelLoginTwoFactor());
    expect(state.twoFactorPending).toBe(false);
  });

  it('clears twoFactorPending on requestLoginSuccess', () => {
    const pendingState: IAuthState = {
      ...initialState,
      twoFactorPending: true,
    };
    const state = authReducer(
      pendingState,
      AuthActions.requestLoginSuccess({ user: dummyUser }),
    );
    expect(state.twoFactorPending).toBe(false);
    expect(state.user).toEqual(dummyUser);
  });

  it('keeps twoFactorPending on non-401 requestLoginTwoFactorError', () => {
    const pendingState: IAuthState = {
      ...initialState,
      twoFactorPending: true,
      loading: true,
    };
    const state = authReducer(
      pendingState,
      AuthActions.requestLoginTwoFactorError({
        error: { status: 400, message: 'Invalid code' } as never,
      }),
    );
    expect(state.twoFactorPending).toBe(true);
    expect(state.loading).toBe(false);
  });

  it('clears twoFactorPending on 401 requestLoginTwoFactorError', () => {
    const pendingState: IAuthState = {
      ...initialState,
      twoFactorPending: true,
      loading: true,
    };
    const state = authReducer(
      pendingState,
      AuthActions.requestLoginTwoFactorError({
        error: { status: 401, message: 'Challenge expired' } as never,
      }),
    );
    expect(state.twoFactorPending).toBe(false);
    expect(state.loading).toBe(false);
  });

  it('updates twoFactorEnabled on setTwoFactorEnabled', () => {
    const userState: IAuthState = {
      ...initialState,
      user: dummyUser,
    };
    const enabledState = authReducer(
      userState,
      AuthActions.setTwoFactorEnabled({ enabled: true }),
    );
    expect(enabledState.user?.twoFactorEnabled).toBe(true);

    const disabledState = authReducer(
      enabledState,
      AuthActions.setTwoFactorEnabled({ enabled: false }),
    );
    expect(disabledState.user?.twoFactorEnabled).toBe(false);
  });
});
