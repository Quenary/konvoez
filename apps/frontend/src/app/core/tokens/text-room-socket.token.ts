import { InjectionToken } from '@angular/core';
import { TextRoomCommon } from '@konvoez/shared';
import { Socket } from 'socket.io-client';

export const TextRoomSocketToken = new InjectionToken<
  Socket<TextRoomCommon.TEventMap>
>('TextRoomSocketToken');
