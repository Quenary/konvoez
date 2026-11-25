import type { EventEmitter2 } from '@nestjs/event-emitter';
import { UsersDomainEvents } from './users.events';
import { UserPresenceService } from './user-presence.service';
import type { UsersService } from './users.service';

describe('UserPresenceService', () => {
  let service: UserPresenceService;
  let eventEmitterMock: { emit: jest.Mock };
  let usersServiceMock: { updateLastSeenAt: jest.Mock };

  beforeEach(() => {
    eventEmitterMock = { emit: jest.fn() };
    usersServiceMock = {
      updateLastSeenAt: jest.fn().mockResolvedValue(undefined),
    };
    service = new UserPresenceService(
      eventEmitterMock as unknown as EventEmitter2,
      usersServiceMock as unknown as UsersService,
    );
  });

  it('initially reports no online users', () => {
    expect(service.isOnline(1)).toBe(false);
    expect(service.getOnlineUserIds()).toEqual([]);
  });

  it('transitions user to online on first connected socket, updates lastSeenAt, and emits domain event', () => {
    service.addSocket(1, 'socket-1');

    expect(service.isOnline(1)).toBe(true);
    expect(service.getOnlineUserIds()).toEqual([1]);
    expect(usersServiceMock.updateLastSeenAt).toHaveBeenCalledWith(
      1,
      expect.any(Date),
    );
    expect(eventEmitterMock.emit).toHaveBeenCalledTimes(1);
    expect(eventEmitterMock.emit).toHaveBeenCalledWith(
      UsersDomainEvents.USER_PRESENCE_CHANGED,
      { userId: 1, isOnline: true, lastSeenAt: expect.any(Date) },
    );
  });

  it('does not emit duplicate event or update lastSeenAt when multiple sockets connect for the same user', () => {
    service.addSocket(1, 'socket-1');
    eventEmitterMock.emit.mockClear();
    usersServiceMock.updateLastSeenAt.mockClear();

    service.addSocket(1, 'socket-2');

    expect(service.isOnline(1)).toBe(true);
    expect(service.getOnlineUserIds()).toEqual([1]);
    expect(eventEmitterMock.emit).not.toHaveBeenCalled();
    expect(usersServiceMock.updateLastSeenAt).not.toHaveBeenCalled();
  });

  it('keeps user online when one of multiple sockets disconnects', () => {
    service.addSocket(1, 'socket-1');
    service.addSocket(1, 'socket-2');
    eventEmitterMock.emit.mockClear();
    usersServiceMock.updateLastSeenAt.mockClear();

    service.removeSocket(1, 'socket-1');

    expect(service.isOnline(1)).toBe(true);
    expect(service.getOnlineUserIds()).toEqual([1]);
    expect(eventEmitterMock.emit).not.toHaveBeenCalled();
    expect(usersServiceMock.updateLastSeenAt).not.toHaveBeenCalled();
  });

  it('transitions user to offline, updates lastSeenAt, and emits domain event when last socket disconnects', () => {
    service.addSocket(1, 'socket-1');
    eventEmitterMock.emit.mockClear();
    usersServiceMock.updateLastSeenAt.mockClear();

    service.removeSocket(1, 'socket-1');

    expect(service.isOnline(1)).toBe(false);
    expect(service.getOnlineUserIds()).toEqual([]);
    expect(usersServiceMock.updateLastSeenAt).toHaveBeenCalledWith(
      1,
      expect.any(Date),
    );
    expect(eventEmitterMock.emit).toHaveBeenCalledTimes(1);
    expect(eventEmitterMock.emit).toHaveBeenCalledWith(
      UsersDomainEvents.USER_PRESENCE_CHANGED,
      { userId: 1, isOnline: false, lastSeenAt: expect.any(Date) },
    );
  });

  it('swallows updateLastSeenAt persistence errors without throwing', async () => {
    usersServiceMock.updateLastSeenAt.mockRejectedValueOnce(
      new Error('db down'),
    );

    expect(() => service.addSocket(1, 'socket-1')).not.toThrow();
    await Promise.resolve();
    expect(service.isOnline(1)).toBe(true);
  });

  it('handles removing non-existent socket gracefully', () => {
    service.removeSocket(999, 'socket-unknown');
    expect(eventEmitterMock.emit).not.toHaveBeenCalled();
    expect(usersServiceMock.updateLastSeenAt).not.toHaveBeenCalled();
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
