import type { EventEmitter2 } from '@nestjs/event-emitter';
import { UsersDomainEvents } from './users.events';
import { UserPresenceService } from './user-presence.service';

describe('UserPresenceService', () => {
  let service: UserPresenceService;
  let eventEmitterMock: { emit: jest.Mock };

  beforeEach(() => {
    eventEmitterMock = { emit: jest.fn() };
    service = new UserPresenceService(
      eventEmitterMock as unknown as EventEmitter2,
    );
  });

  it('initially reports no online users', () => {
    expect(service.isOnline(1)).toBe(false);
    expect(service.getOnlineUserIds()).toEqual([]);
  });

  it('transitions user to online on first connected socket and emits domain event', () => {
    service.addSocket(1, 'socket-1');

    expect(service.isOnline(1)).toBe(true);
    expect(service.getOnlineUserIds()).toEqual([1]);
    expect(eventEmitterMock.emit).toHaveBeenCalledTimes(1);
    expect(eventEmitterMock.emit).toHaveBeenCalledWith(
      UsersDomainEvents.USER_PRESENCE_CHANGED,
      { userId: 1, isOnline: true },
    );
  });

  it('does not emit duplicate event when multiple sockets connect for the same user', () => {
    service.addSocket(1, 'socket-1');
    eventEmitterMock.emit.mockClear();

    service.addSocket(1, 'socket-2');

    expect(service.isOnline(1)).toBe(true);
    expect(service.getOnlineUserIds()).toEqual([1]);
    expect(eventEmitterMock.emit).not.toHaveBeenCalled();
  });

  it('keeps user online when one of multiple sockets disconnects', () => {
    service.addSocket(1, 'socket-1');
    service.addSocket(1, 'socket-2');
    eventEmitterMock.emit.mockClear();

    service.removeSocket(1, 'socket-1');

    expect(service.isOnline(1)).toBe(true);
    expect(service.getOnlineUserIds()).toEqual([1]);
    expect(eventEmitterMock.emit).not.toHaveBeenCalled();
  });

  it('transitions user to offline and emits domain event when last socket disconnects', () => {
    service.addSocket(1, 'socket-1');
    eventEmitterMock.emit.mockClear();

    service.removeSocket(1, 'socket-1');

    expect(service.isOnline(1)).toBe(false);
    expect(service.getOnlineUserIds()).toEqual([]);
    expect(eventEmitterMock.emit).toHaveBeenCalledTimes(1);
    expect(eventEmitterMock.emit).toHaveBeenCalledWith(
      UsersDomainEvents.USER_PRESENCE_CHANGED,
      { userId: 1, isOnline: false },
    );
  });

  it('handles removing non-existent socket gracefully', () => {
    service.removeSocket(999, 'socket-unknown');
    expect(eventEmitterMock.emit).not.toHaveBeenCalled();
  });

  it('tracks distinct users independently', () => {
    service.addSocket(1, 's1');
    service.addSocket(2, 's2');

    expect(service.isOnline(1)).toBe(true);
    expect(service.isOnline(2)).toBe(true);
    expect(service.isOnline(3)).toBe(false);
    expect(service.getOnlineUserIds().sort()).toEqual([1, 2]);

    service.removeSocket(1, 's1');
    expect(service.isOnline(1)).toBe(false);
    expect(service.isOnline(2)).toBe(true);
    expect(service.getOnlineUserIds()).toEqual([2]);
  });
});
