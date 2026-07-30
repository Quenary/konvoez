import { InjectionToken } from '@angular/core';
import { VoiceRoomEventMap } from '@konvoez/shared';
import { Socket } from 'socket.io-client';

export const VoiceRoomSocketToken = new InjectionToken<
  Socket<VoiceRoomEventMap>
>('VoiceRoomSocketToken');
