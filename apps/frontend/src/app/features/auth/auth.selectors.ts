import { createSelector } from '@ngrx/store';
import { IAppState } from '../../app.state';

const _selectAuth = (state: IAppState) => state.auth;

export const selectAuth = createSelector(_selectAuth, (auth) => auth);
export const selectIsAuthorized = createSelector(
  _selectAuth,
  (auth) => !!auth.user,
);
export const selectAuthLoading = createSelector(
  _selectAuth,
  (auth) => auth.loading,
);
export const selectCurrentUser = createSelector(
  _selectAuth,
  (state) => state.user,
);
