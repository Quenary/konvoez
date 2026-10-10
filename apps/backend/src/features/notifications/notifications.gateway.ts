import { Inject } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  OnGatewayConnection,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { DefaultEventsMap, Server, Socket } from 'socket.io';
import {
  ENotificationsEvent,
  type TNotificationsEventMap,
} from '@konvoez/shared';
import { AuthService } from '../auth/auth.service';
import {
  NotificationsDomainEvents,
  type INotificationDeliverPayload,
} from '@shared/events/notifications.events';

type TSocket = Socket<
  TNotificationsEventMap,
  TNotificationsEventMap,
  DefaultEventsMap,
  { userId?: number }
>;

@WebSocketGateway({
  path: '/ws/v1/notifications',
  cors: { origin: '*' },
})
export class NotificationsGateway implements OnGatewayConnection {
  @WebSocketServer()
  private readonly server!: Server<TNotificationsEventMap>;

  @Inject(AuthService)
  private readonly authService!: AuthService;

  async handleConnection(client: TSocket) {
    try {
      const user = await this.authService.getUserFromRawCookies(
        client.handshake.headers.cookie,
      );

      if (!user) {
        client.disconnect(true);
        return;
      }

      client.data.userId = user.id;
      await client.join(`user:${user.id}`);
    } catch {
      client.disconnect(true);
    }
  }

  @OnEvent(NotificationsDomainEvents.DELIVER)
  onNotificationDeliver({ userId, payload }: INotificationDeliverPayload) {
    this.server
      .to(`user:${userId}`)
      .emit(ENotificationsEvent.NOTIFICATION, payload);
  }
}
