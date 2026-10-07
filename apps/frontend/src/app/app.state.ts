import { IAuthState } from './features/auth/auth.reducer';

export interface IAppState {
  auth: IAuthState;
}
