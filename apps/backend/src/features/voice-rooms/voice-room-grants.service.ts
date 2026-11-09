import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  emitVoiceRoomsDomainEvent,
  VoiceRoomsDomainEvents,
} from './voice-rooms.events';

export interface IVoiceRoomGrant {
  userId: number;
  roomId: number;
  expiresAt: number;
}

export interface IActiveGuestRecord {
  userId: number;
  roomId: number;
  socketId: string;
}

interface IRetainedGuest {
  userId: number;
  roomId: number;
  expiresAt: number;
}

export const DEFAULT_MOVE_GRANT_TTL_MS = 30_000;

@Injectable()
export class VoiceRoomGrantsService implements OnModuleDestroy {
  /**
   * Key: `${userId}:${roomId}` -> grant
   */
  private readonly grants = new Map<string, IVoiceRoomGrant>();

  /**
   * Key: socketId -> guest record
   */
  private readonly activeGuestsBySocket = new Map<string, IActiveGuestRecord>();

  /**
   * Key: `${userId}:${roomId}` -> membership kept after the last socket leaves
   * so a reconnect can rejoin without a new move grant.
   */
  private readonly retainedGuests = new Map<string, IRetainedGuest>();

  private readonly cleanupInterval: NodeJS.Timeout;

  constructor(private readonly eventEmitter: EventEmitter2) {
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredGrants();
    }, 10_000);
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }

  onModuleDestroy(): void {
    clearInterval(this.cleanupInterval);
    this.grants.clear();
    this.activeGuestsBySocket.clear();
    this.retainedGuests.clear();
  }

  private grantKey(userId: number, roomId: number): string {
    return `${userId}:${roomId}`;
  }

  /**
   * Creates a one-time in-memory grant for a user to join a room.
   */
  public createGrant(
    userId: number,
    roomId: number,
    ttlMs: number = DEFAULT_MOVE_GRANT_TTL_MS,
  ): void {
    const key = this.grantKey(userId, roomId);
    this.grants.set(key, {
      userId,
      roomId,
      expiresAt: Date.now() + ttlMs,
    });
  }

  /**
   * Consumes a matching, non-expired grant.
   * Returns true if a valid grant was found and consumed, false otherwise.
   */
  public consumeGrant(userId: number, roomId: number): boolean {
    const key = this.grantKey(userId, roomId);
    const grant = this.grants.get(key);
    if (!grant) {
      return false;
    }

    if (Date.now() > grant.expiresAt) {
      this.grants.delete(key);
      return false;
    }

    this.grants.delete(key);
    return true;
  }

  public hasGrant(userId: number, roomId: number): boolean {
    const key = this.grantKey(userId, roomId);
    const grant = this.grants.get(key);
    if (!grant) {
      return false;
    }
    if (Date.now() > grant.expiresAt) {
      this.grants.delete(key);
      return false;
    }
    return true;
  }

  /**
   * Registers a connected socket as an active guest in a private room.
   */
  public addActiveGuest(
    userId: number,
    roomId: number,
    socketId: string,
  ): void {
    this.activeGuestsBySocket.set(socketId, { userId, roomId, socketId });
    this.retainedGuests.delete(this.grantKey(userId, roomId));
  }

  /**
   * Unregisters a socket from active guest status. When the last socket of the
   * user leaves, the membership is either kept for a short reconnect window
   * (`retain`, connection loss) or dropped at once (explicit leave, move).
   */
  public removeActiveGuest(
    socketId: string,
    retain = false,
  ): IActiveGuestRecord | null {
    const existing = this.activeGuestsBySocket.get(socketId);
    if (!existing) {
      return null;
    }
    this.activeGuestsBySocket.delete(socketId);
    if (!this.hasSocketGuest(existing.userId, existing.roomId)) {
      if (retain) {
        this.retainedGuests.set(
          this.grantKey(existing.userId, existing.roomId),
          {
            userId: existing.userId,
            roomId: existing.roomId,
            expiresAt: Date.now() + DEFAULT_MOVE_GRANT_TTL_MS,
          },
        );
      } else {
        this.emitGuestLeft(existing.userId, existing.roomId);
      }
    }
    return existing;
  }

  public isUserActiveGuestInRoom(userId: number, roomId: number): boolean {
    if (this.hasSocketGuest(userId, roomId)) {
      return true;
    }
    const retained = this.retainedGuests.get(this.grantKey(userId, roomId));
    return retained !== undefined && Date.now() <= retained.expiresAt;
  }

  /**
   * Revokes any temporary move grant and guest access for a user in a room,
   * ensuring no retained-guest window or pending grant remains.
   */
  public revokeGuestAccess(userId: number, roomId: number): void {
    const key = this.grantKey(userId, roomId);
    this.grants.delete(key);
    const wasRetained = this.retainedGuests.delete(key);
    let hadSocket = false;
    for (const [socketId, record] of this.activeGuestsBySocket.entries()) {
      if (record.userId === userId && record.roomId === roomId) {
        this.activeGuestsBySocket.delete(socketId);
        hadSocket = true;
      }
    }
    if (hadSocket || wasRetained) {
      this.emitGuestLeft(userId, roomId);
    }
  }

  public getUserActiveGuestRooms(userId: number): number[] {
    const now = Date.now();
    const roomIds = new Set<number>();
    for (const record of this.activeGuestsBySocket.values()) {
      if (record.userId === userId) {
        roomIds.add(record.roomId);
      }
    }
    for (const guest of this.retainedGuests.values()) {
      if (guest.userId === userId && now <= guest.expiresAt) {
        roomIds.add(guest.roomId);
      }
    }
    return Array.from(roomIds);
  }

  public cleanupExpiredGrants(): void {
    const now = Date.now();
    for (const [key, grant] of this.grants.entries()) {
      if (now > grant.expiresAt) {
        this.grants.delete(key);
      }
    }
    this.expireRetainedGuests(now);
  }

  private hasSocketGuest(userId: number, roomId: number): boolean {
    for (const record of this.activeGuestsBySocket.values()) {
      if (record.userId === userId && record.roomId === roomId) {
        return true;
      }
    }
    return false;
  }

  private emitGuestLeft(userId: number, roomId: number): void {
    emitVoiceRoomsDomainEvent(
      this.eventEmitter,
      VoiceRoomsDomainEvents.VOICE_ROOM_GUEST_LEFT,
      { userId, roomId },
    );
  }

  private expireRetainedGuests(now: number): void {
    for (const [key, guest] of this.retainedGuests.entries()) {
      if (now <= guest.expiresAt) {
        continue;
      }
      this.retainedGuests.delete(key);
      this.emitGuestLeft(guest.userId, guest.roomId);
    }
  }
}
