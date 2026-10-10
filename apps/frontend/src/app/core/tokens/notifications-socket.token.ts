import { InjectionToken } from '@angular/core';
import { type TNotificationsEventMap } from '@konvoez/shared';
import { Socket } from 'socket.io-client';

export const NotificationsSocketToken = new InjectionToken<
  Socket<TNotificationsEventMap>
>('NotificationsSocketToken');
