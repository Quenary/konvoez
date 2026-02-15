import { Injectable } from '@nestjs/common';
import { VoiceRoomCommon } from '@common/voice-room';

@Injectable()
export class VoiceRoomsCacheService {
  private readonly rooms: Record<number, VoiceRoomCommon.IPeer[]> = {};

  public addPeer(roomId: number, peer: VoiceRoomCommon.IPeer): void {
    if (!this.rooms[roomId]) {
      this.rooms[roomId] = [];
    }
    this.rooms[roomId].push(peer);
  }

  public removePeer(peer: VoiceRoomCommon.IPeer): void {
    Object.keys(this.rooms).forEach((roomId) => {
      this.rooms[roomId] = this.rooms[roomId as any].filter(
        (p) => p.id !== peer.id,
      );
    });
  }

  public getRoomWithPeers(roomId: number): VoiceRoomCommon.IRoomWithPeers {
    if (!this.rooms[roomId]) {
      return { roomId, peers: [] };
    }
    return { roomId, peers: this.rooms[roomId] };
  }

  public getAllRoomsWithPeers(): VoiceRoomCommon.IRoomWithPeers[] {
    return Object.keys(this.rooms).map((roomId) => {
      return { roomId: +roomId, peers: this.rooms[roomId] };
    });
  }
}
