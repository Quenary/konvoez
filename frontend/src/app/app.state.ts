import { IAuthState } from './features/auth/auth.reducer';
import { IRoomsState } from './features/rooms/rooms.reducer';
import { ISettingsState } from './features/settings/settings.reducer';
import { ITextRoomState } from './features/text-room/text-room.reducer';
import { IVoiceRoomState } from './features/voice-room/voice-room.reducer';

export interface IAppState {
  auth: IAuthState;
  rooms: IRoomsState;
  textRoom: ITextRoomState;
  voiceRoom: IVoiceRoomState;
  settings: ISettingsState;
}
