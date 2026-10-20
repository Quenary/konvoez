import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { UsersDomainEvents, emitUsersDomainEvent } from './users.events';

@Injectable()
export class UserPresenceService {
  private readonly userSockets = new Map<number, Set<string>>();

  constructor(private readonly eventEmitter: EventEmitter2) {}

  public addSocket(userId: number, socketId: string): void {
    let sockets = this.userSockets.get(userId);
    const wasOnline = Boolean(sockets && sockets.size > 0);
    if (!sockets) {
      sockets = new Set<string>();
      this.userSockets.set(userId, sockets);
    }
    sockets.add(socketId);

    if (!wasOnline) {
      emitUsersDomainEvent(
        this.eventEmitter,
        UsersDomainEvents.USER_PRESENCE_CHANGED,
        { userId, isOnline: true },
      );
    }
  }

  public removeSocket(userId: number, socketId: string): void {
    const sockets = this.userSockets.get(userId);
    if (!sockets) {
      return;
    }
    if (!sockets.delete(socketId)) {
      return;
    }
    if (sockets.size === 0) {
      this.userSockets.delete(userId);
      emitUsersDomainEvent(
        this.eventEmitter,
        UsersDomainEvents.USER_PRESENCE_CHANGED,
        { userId, isOnline: false },
      );
    }
  }

  public isOnline(userId: number): boolean {
    const sockets = this.userSockets.get(userId);
    return Boolean(sockets && sockets.size > 0);
  }

  public getOnlineUserIds(): number[] {
    return Array.from(this.userSockets.keys());
  }
}
