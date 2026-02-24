import { InjectionToken } from '@angular/core';
import { TextRoomCommon } from '@common/text-room';
import { Socket } from 'socket.io-client';

export const TextRoomSocketToken = new InjectionToken<
  Socket<TextRoomCommon.TEventMap>
>('TextRoomSocketToken');
