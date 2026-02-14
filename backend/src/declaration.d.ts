import { VoiceRoomCommon } from '@common/voice-room';
import 'socket.io';

declare module 'socket.io' {
  export interface Socket {
    data: {
      roomId?: number;
      peer?: VoiceRoomCommon.IPeer;
    };
  }
}
