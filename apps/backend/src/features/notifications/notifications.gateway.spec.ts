jest.mock('../auth/auth.service', () => ({
  AuthService: class {},
}));

import { NotificationsGateway } from './notifications.gateway';
import {
  ENotificationsEvent,
  EUserRole,
  type IUser,
  type TPushNotificationPayload,
} from '@konvoez/shared';
import { Server } from 'socket.io';

describe('NotificationsGateway', () => {
  let gateway: NotificationsGateway;
  let serverMock: { emit: jest.Mock; to: jest.Mock };
  let authServiceMock: { getUserFromRawCookies: jest.Mock };
  let toMock: jest.Mock;

  const user: IUser = {
    id: 1,
    username: 'alice',
    fullname: 'Alice',
    email: 'alice@example.com',
    role: EUserRole.MEMBER,
    avatar: null,
    avatarUrl: null,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: null,
  };

  beforeEach(() => {
    gateway = new NotificationsGateway();

    toMock = jest.fn().mockReturnValue({ emit: jest.fn() });
    serverMock = {
      emit: jest.fn(),
      to: toMock,
    };

    authServiceMock = {
      getUserFromRawCookies: jest.fn(),
    };

    Object.defineProperty(gateway, 'server', {
      value: serverMock as unknown as Server,
      writable: true,
    });
    Object.defineProperty(gateway, 'authService', {
      value: authServiceMock,
      writable: true,
    });
  });

  describe('handleConnection', () => {
    it('should disconnect if user is not authorized', async () => {
      authServiceMock.getUserFromRawCookies.mockResolvedValue(null);
      const client = {
        handshake: { headers: { cookie: 'bad-cookie' } },
        disconnect: jest.fn(),
      };

      await gateway.handleConnection(
        client as unknown as Parameters<typeof gateway.handleConnection>[0],
      );

      expect(client.disconnect).toHaveBeenCalledWith(true);
    });

    it('should disconnect on auth error', async () => {
      authServiceMock.getUserFromRawCookies.mockRejectedValue(
        new Error('fail'),
      );
      const client = {
        handshake: { headers: { cookie: 'bad-cookie' } },
        disconnect: jest.fn(),
      };

      await gateway.handleConnection(
        client as unknown as Parameters<typeof gateway.handleConnection>[0],
      );

      expect(client.disconnect).toHaveBeenCalledWith(true);
    });

    it('should join user room on successful auth', async () => {
      authServiceMock.getUserFromRawCookies.mockResolvedValue(user);
      const client = {
        handshake: { headers: { cookie: 'valid-cookie' } },
        data: {} as { userId?: number },
        join: jest.fn(),
        disconnect: jest.fn(),
      };

      await gateway.handleConnection(
        client as unknown as Parameters<typeof gateway.handleConnection>[0],
      );

      expect(client.data.userId).toBe(user.id);
      expect(client.join).toHaveBeenCalledWith(`user:${user.id}`);
      expect(client.disconnect).not.toHaveBeenCalled();
    });
  });

  describe('onNotificationDeliver', () => {
    it('should emit NOTIFICATION event to user room on DELIVER event', () => {
      const roomEmit = jest.fn();
      toMock.mockReturnValue({ emit: roomEmit });
      const payload: TPushNotificationPayload = {
        title: 'Alice',
        body: 'Hello',
      };

      gateway.onNotificationDeliver({ userId: 1, payload });

      expect(serverMock.to).toHaveBeenCalledWith('user:1');
      expect(roomEmit).toHaveBeenCalledWith(
        ENotificationsEvent.NOTIFICATION,
        payload,
      );
    });
  });
});
