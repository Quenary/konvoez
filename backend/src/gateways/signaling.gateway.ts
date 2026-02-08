import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { ROOMS } from 'src/features/rooms/rooms';

@WebSocketGateway({
  cors: { origin: '*' },
})
export class SignalingGateway {
  @WebSocketServer()
  server!: Server;

  handleDisconnect(client: Socket) {
    Object.values(ROOMS).forEach(room => room.delete(client.id));
    this.server.emit('peer-left', { peerId: client.id });
  }

  @SubscribeMessage('join-room')
  handleJoin(
    @MessageBody() { roomId }: { roomId: keyof typeof ROOMS },
    @ConnectedSocket() client: Socket
  ) {
    const room = ROOMS[roomId];
    if (!room) return;

    room.add(client.id);
    client.join(roomId);

    // отправляем новому список уже существующих peer’ов
    client.emit('existing-peers', [...room].filter(id => id !== client.id));

    // уведомляем остальных
    client.to(roomId).emit('new-peer', { peerId: client.id });
  }

  @SubscribeMessage('signal')
  handleSignal(
    @MessageBody() data: any,
    @ConnectedSocket() client: Socket
  ) {
    const { target, payload } = data;
    this.server.to(target).emit('signal', {
      from: client.id,
      payload
    });
  }
}
