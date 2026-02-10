import { VoiceSocket } from '@common/voice-socket';
import VSev = VoiceSocket.EEvent;
import VSd = VoiceSocket.TEventData;
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { ROOMS } from 'src/features/rooms/rooms';
import { UseGuards } from '@nestjs/common';
import { AuthWsGuard } from 'src/features/auth/auth-ws.guard';

@WebSocketGateway({
  cors: { origin: '*' },
})
@UseGuards(AuthWsGuard)
export class SignalingGateway {
  @WebSocketServer()
  server!: Server;

  handleDisconnect(client: Socket) {
    Object.values(ROOMS).forEach((room) => room.delete(client.id));
    this.server.emit(VSev.PEER_LEFT, { peerId: client.id });
    console.log('disconnected');
  }

  @SubscribeMessage(VSev.JOIN_ROOM)
  handleJoin(
    @MessageBody() { roomId }: { roomId: keyof typeof ROOMS },
    @ConnectedSocket() client: Socket,
  ) {
    const room = ROOMS[roomId];
    if (!room) return;

    room.add(client.id);
    client.join(roomId);

    // отправляем новому список уже существующих peer’ов
    client.emit(
      VSev.EXISTING_PEERS,
      [...room].filter((id) => id !== client.id),
    );

    // уведомляем остальных
    client.to(roomId).emit(VSev.PEER_JOINED, { peerId: client.id });
  }

  @SubscribeMessage(VSev.SIGNAL)
  handleSignal(@MessageBody() data: any, @ConnectedSocket() client: Socket) {
    const { target, payload } = data;
    this.server.to(target).emit(VSev.SIGNAL, {
      from: client.id,
      payload,
    });
  }
}
