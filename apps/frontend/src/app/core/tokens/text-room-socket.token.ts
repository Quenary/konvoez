import { InjectionToken } from '@angular/core';
import { TTextRoomEventMap } from '@konvoez/shared';
import { Socket } from 'socket.io-client';

export const TextRoomSocketToken = new InjectionToken<
  Socket<TTextRoomEventMap>
>('TextRoomSocketToken');
