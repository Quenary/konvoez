import { Injectable } from '@nestjs/common';
import { VoiceChatNS } from '@common/voice-chat';

@Injectable()
export class VoiceRoomsCacheService {
  private readonly rooms: Record<number, VoiceChatNS.IPeer[]> = {};

  public addUserToRoom(roomId: number, user: VoiceChatNS.IPeer) {
    if (!this.rooms[roomId]) {
      this.rooms[roomId] = [];
    }
    this.rooms[roomId].push(user);
  }

  public removeUserFromRoom(roomId: number, user: VoiceChatNS.IPeer): void {
    if (!this.rooms[roomId]) {
      return;
    }
    this.rooms[roomId] = this.rooms[roomId].filter((u) => u.id !== user.id);
  }

  public removeUserFromAllRooms(user: VoiceChatNS.IPeer): void {
    Object.keys(this.rooms).forEach((roomId) => {
      this.removeUserFromRoom(Number(roomId), user);
    });
  }

  public getRoomWithPeers(roomId: number): VoiceChatNS.IRoomWithPeers {
    if (!this.rooms[roomId]) {
      return { roomId, peers: [] };
    }
    return { roomId, peers: this.rooms[roomId] };
  }

  public getRoomUserIds(roomId: number): number[] {
    if (!this.rooms[roomId]) {
      return [];
    }
    return this.rooms[roomId].map((user) => user.id);
  }

  public getUserRoomId(user: VoiceChatNS.IPeer): number {
    if (!this.rooms) {
      return -1;
    }
    for (const roomId in this.rooms) {
      if (this.rooms[roomId].includes(user)) {
        return Number(roomId);
      }
    }
    return -1;
  }

  public getAllRooms(): Readonly<
    Record<number, Readonly<VoiceChatNS.IPeer>[]>
  > {
    return this.rooms;
  }
}
