import { IAuthState } from './features/auth/auth.reducer';
import { IRoomsState } from './features/rooms/rooms.reducer';

export interface IAppState {
  auth: IAuthState;
  rooms: IRoomsState;
}
