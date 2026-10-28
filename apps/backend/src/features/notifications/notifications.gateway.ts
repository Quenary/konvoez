import { Inject } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { DefaultEventsMap, Server, Socket } from 'socket.io';
import {
  ENotificationsEvent,
  ESocketEvent,
  type TNotificationsEventMap,
} from '@konvoez/shared';
import { AuthService } from '../auth/auth.service';
import {
  UsersDomainEvents,
  type TUsersDomainPayloadMap,
} from '../users/users.events';
import {
  NotificationsDomainEvents,
  type INotificationDeliverPayload,
  type INotificationDismissPayload,
} from './notifications.events';

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

  @SubscribeMessage(ESocketEvent.PING)
  handlePing(): object {
    return {};
  }

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

  @OnEvent(NotificationsDomainEvents.DISMISS)
  onNotificationDismiss(payload: INotificationDismissPayload) {
    this.server
      .to(`user:${payload.userId}`)
      .emit(ENotificationsEvent.NOTIFICATION_DISMISS, {
        tag: payload.tag,
        topic: payload.topic,
        messageId: payload.messageId,
      });
  }

  @OnEvent(UsersDomainEvents.USER_SESSIONS_REVOKED)
  async onUserSessionsRevoked(
    payload: TUsersDomainPayloadMap[typeof UsersDomainEvents.USER_SESSIONS_REVOKED],
  ): Promise<void> {
    const sockets = await this.server.fetchSockets();
    for (const socket of sockets) {
      if (socket.data.userId === payload.id) {
        socket.disconnect(true);
      }
    }
  }
}
