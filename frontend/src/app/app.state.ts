import { IAuthState } from './features/auth/auth.reducer';
import { IRoomsState } from './features/rooms/rooms.reducer';
import { IVoiceChatState } from './features/voice-chat/voice-chat.reducer';

export interface IAppState {
  auth: IAuthState;
  rooms: IRoomsState;
  voiceChat: IVoiceChatState;
}
