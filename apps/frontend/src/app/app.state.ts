import { IAuthState } from './features/auth/auth.reducer';
import { IRoomsState } from './features/rooms/rooms.reducer';
import { ISettingsState } from './features/settings/settings.reducer';

export interface IAppState {
  auth: IAuthState;
  rooms: IRoomsState;
  settings: ISettingsState;
}
