import { VoiceChatNS } from '@common/voice-chat';
import 'socket.io';

declare module 'socket.io' {
  export interface Socket {
    data: {
      roomId?: number;
      peer?: VoiceChatNS.IPeer;
    };
  }
}
