import { InjectionToken } from '@angular/core';
import { VoiceRoomCommon } from '@common/voice-room';
import { Socket } from 'socket.io-client';

export const VoiceRoomSocketToken = new InjectionToken<
  Socket<VoiceRoomCommon.TEventMap>
>('VoiceRoomSocketToken');
