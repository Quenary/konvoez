import type { EventEmitter2 } from '@nestjs/event-emitter';

export function createDomainEventEmitter<M extends Record<string, unknown>>() {
  return <K extends keyof M & string>(
    eventEmitter: EventEmitter2,
    event: K,
    payload: M[K],
  ): void => {
    eventEmitter.emit(event, payload);
  };
}
