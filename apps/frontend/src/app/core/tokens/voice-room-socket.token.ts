import { InjectionToken } from '@angular/core';
import { TVoiceRoomEventMap } from '@konvoez/shared';
import { Socket } from 'socket.io-client';

export const VoiceRoomSocketToken = new InjectionToken<
  Socket<TVoiceRoomEventMap>
>('VoiceRoomSocketToken');
