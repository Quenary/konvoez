import { EventEmitter2 } from '@nestjs/event-emitter';
import { VoiceRoomsDomainEvents } from './voice-rooms.events';
import {
  DEFAULT_MOVE_GRANT_TTL_MS,
  VoiceRoomGrantsService,
} from './voice-room-grants.service';

describe('VoiceRoomGrantsService', () => {
  let service: VoiceRoomGrantsService;
  let eventEmitter: { emit: jest.Mock };

  beforeEach(() => {
    eventEmitter = { emit: jest.fn() };
    service = new VoiceRoomGrantsService(
      eventEmitter as unknown as EventEmitter2,
    );
  });

  afterEach(() => {
    service.onModuleDestroy();
  });

  describe('grants lifecycle', () => {
    it('creates and consumes a valid grant', () => {
      service.createGrant(1, 10, 5000);
      expect(service.hasGrant(1, 10)).toBe(true);
      expect(service.consumeGrant(1, 10)).toBe(true);
      // One-time use: subsequent consume returns false
      expect(service.consumeGrant(1, 10)).toBe(false);
      expect(service.hasGrant(1, 10)).toBe(false);
    });

    it('returns false when consuming a non-existent grant', () => {
      expect(service.consumeGrant(99, 99)).toBe(false);
    });

    it('expires grants after TTL lapses', () => {
      service.createGrant(1, 10, -100); // Already expired
      expect(service.hasGrant(1, 10)).toBe(false);
      expect(service.consumeGrant(1, 10)).toBe(false);
    });

    it('cleans up expired grants without affecting active ones', () => {
      service.createGrant(1, 10, -500); // Expired
      service.createGrant(2, 20, 60_000); // Active

      service.cleanupExpiredGrants();

      expect(service.hasGrant(1, 10)).toBe(false);
      expect(service.hasGrant(2, 20)).toBe(true);
    });
  });

  describe('active guests tracking', () => {
    it('adds active guests by socket id and drops them at once on explicit leave', () => {
      service.addActiveGuest(1, 10, 'socket-abc');

      expect(service.isUserActiveGuestInRoom(1, 10)).toBe(true);
      expect(service.isUserActiveGuestInRoom(1, 20)).toBe(false);
      expect(service.getUserActiveGuestRooms(1)).toEqual([10]);

      const removed = service.removeActiveGuest('socket-abc');
      expect(removed).toEqual({
        userId: 1,
        roomId: 10,
        socketId: 'socket-abc',
      });

      expect(service.isUserActiveGuestInRoom(1, 10)).toBe(false);
      expect(service.getUserActiveGuestRooms(1)).toEqual([]);
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        VoiceRoomsDomainEvents.VOICE_ROOM_GUEST_LEFT,
        { userId: 1, roomId: 10 },
      );
    });

    it('retains membership after connection loss and emits guest-left on cleanup after the window', () => {
      const now = jest.spyOn(Date, 'now');
      now.mockReturnValue(1_000);
      service.addActiveGuest(1, 10, 'socket-abc');
      service.removeActiveGuest('socket-abc', true);

      expect(service.isUserActiveGuestInRoom(1, 10)).toBe(true);
      expect(service.getUserActiveGuestRooms(1)).toEqual([10]);
      expect(eventEmitter.emit).not.toHaveBeenCalled();

      now.mockReturnValue(1_000 + DEFAULT_MOVE_GRANT_TTL_MS + 1);

      expect(service.isUserActiveGuestInRoom(1, 10)).toBe(false);
      expect(service.getUserActiveGuestRooms(1)).toEqual([]);
      expect(eventEmitter.emit).not.toHaveBeenCalled();

      service.cleanupExpiredGrants();
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        VoiceRoomsDomainEvents.VOICE_ROOM_GUEST_LEFT,
        { userId: 1, roomId: 10 },
      );
      now.mockRestore();
    });

    it('keeps membership while another socket of the user is still in the room', () => {
      service.addActiveGuest(1, 10, 'socket-a');
      service.addActiveGuest(1, 10, 'socket-b');

      service.removeActiveGuest('socket-a');

      expect(service.isUserActiveGuestInRoom(1, 10)).toBe(true);
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('returns null when removing a non-existent guest socket', () => {
      expect(service.removeActiveGuest('unknown-socket')).toBeNull();
    });

    it('revokes active guest, retained guest and pending grants immediately on revokeGuestAccess', () => {
      service.createGrant(1, 10);
      service.addActiveGuest(1, 10, 'socket-a');
      service.addActiveGuest(1, 10, 'socket-b');

      expect(service.hasGrant(1, 10)).toBe(true);
      expect(service.isUserActiveGuestInRoom(1, 10)).toBe(true);

      service.revokeGuestAccess(1, 10);

      expect(service.hasGrant(1, 10)).toBe(false);
      expect(service.isUserActiveGuestInRoom(1, 10)).toBe(false);
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        VoiceRoomsDomainEvents.VOICE_ROOM_GUEST_LEFT,
        { userId: 1, roomId: 10 },
      );

      // Re-calling revoke when user is not a guest does not emit again
      eventEmitter.emit.mockClear();
      service.revokeGuestAccess(1, 10);
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('revokes retained guest on revokeGuestAccess and emits guest-left', () => {
      service.addActiveGuest(1, 10, 'socket-a');
      service.removeActiveGuest('socket-a', true); // retained

      expect(service.isUserActiveGuestInRoom(1, 10)).toBe(true);
      expect(eventEmitter.emit).not.toHaveBeenCalled();

      service.revokeGuestAccess(1, 10);

      expect(service.isUserActiveGuestInRoom(1, 10)).toBe(false);
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        VoiceRoomsDomainEvents.VOICE_ROOM_GUEST_LEFT,
        { userId: 1, roomId: 10 },
      );
    });
  });
});
