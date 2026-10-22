import { fromEvent, type Observable, switchMap, take } from 'rxjs';
import type { Socket } from 'socket.io-client';

/** Emits on every `connect` that follows a `disconnect` (not the first connect). */
export function socketReconnected$(socket: Socket): Observable<unknown> {
  return fromEvent(socket, 'disconnect').pipe(
    switchMap(() => fromEvent(socket, 'connect').pipe(take(1))),
  );
}
