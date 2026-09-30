import { InjectionToken } from '@angular/core';
import { TEntitySyncEventMap } from '@konvoez/shared';
import { Socket } from 'socket.io-client';

export const EntitySyncSocketToken = new InjectionToken<
  Socket<TEntitySyncEventMap>
>('EntitySyncSocketToken');
