import { Injectable } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { VoiceSocket } from '@common/voice-socket';
import VSev = VoiceSocket.EEvent;

@Injectable({ providedIn: 'root' })
export class SignalingService {
  socket!: Socket;

  connect() {
    this.socket = io();
  }

  joinRoom(roomId: string) {
    this.socket.emit(VSev.JOIN_ROOM, { roomId });
  }

  signal(target: string, payload: any) {
    this.socket.emit(VSev.SIGNAL, { target, payload });
  }
}
