import { Injectable } from '@angular/core';
import { io, Socket } from 'socket.io-client';

@Injectable({ providedIn: 'root' })
export class SignalingService {
  socket!: Socket;

  connect() {
    this.socket = io();
  }

  joinRoom(roomId: string) {
    this.socket.emit('join-room', { roomId });
  }

  signal(target: string, payload: any) {
    this.socket.emit('signal', { target, payload });
  }
}
