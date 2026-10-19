import type { EventEmitter2 } from '@nestjs/event-emitter';

export interface IAppEvent<TName extends string = string, TPayload = unknown> {
  readonly event: TName;
  readonly payload: TPayload;
}

export type TAppEventPayloadMap = Record<string, unknown>;

export function emitAppEvent<
  M extends TAppEventPayloadMap,
  K extends keyof M & string,
>(eventEmitter: EventEmitter2, event: K, payload: M[K]): void {
  eventEmitter.emit(event, payload);
}
