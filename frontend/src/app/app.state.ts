import { IAuthState } from './features/auth/auth.reducer';
import { IRoomsState } from './features/rooms/rooms.reducer';
import { ISettingsState } from './features/settings/settings.reducer';
import { IVoiceRoomState } from './features/voice-room/voice-room.reducer';

export interface IAppState {
  auth: IAuthState;
  rooms: IRoomsState;
  voiceRoom: IVoiceRoomState;
  settings: ISettingsState;
}
