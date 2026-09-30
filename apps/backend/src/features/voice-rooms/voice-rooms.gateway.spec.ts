jest.mock('@mikro-orm/nestjs', () => ({
  InjectRepository: () => () => undefined,
}));
jest.mock('../auth/auth.service', () => ({
  AuthService: class {},
}));
jest.mock('@shared/services/app.service', () => ({
  AppService: class {},
}));
// Keep mediasoup out of Jest resolution (node10 / package exports). Specs mock state.
jest.mock('mediasoup', () => ({
  createWorker: jest.fn(),
}));
jest.mock('mediasoup/types', () => ({}), { virtual: true });

import { VoiceRoomsGateway } from './voice-rooms.gateway';
import { VoiceRoomsStateService } from './voice-rooms.state';
import { DirectCallsStateService } from './direct-calls.state';
import { AuthService } from '../auth/auth.service';
import {
  EDirectCallEvent,
  EUserRole,
  EVoiceRoomEvent,
  EVoiceSessionType,
  type IUser,
} from '@konvoez/shared';
import { NotificationsDomainEvents } from '@shared/events/notifications.events';
import { Server, Socket } from 'socket.io';

const alice: IUser = {
  id: 7,
  username: 'alice',
  fullname: 'Alice',
  email: 'alice@example.com',
  avatarUrl: null,
  role: EUserRole.MEMBER,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const bob: IUser = {
  ...alice,
  id: 8,
  username: 'bob',
  fullname: 'Bob',
  email: 'bob@example.com',
};

function createRoom(peers: Map<string, unknown> = new Map()) {
  return {
    id: 'room:1',
    peers,
    producers: new Map(),
  };
}

function createSocket(
  overrides: Partial<{
    id: string;
    data: Record<string, unknown>;
  }> = {},
): Socket {
  return {
    id: overrides.id ?? 'socket-1',
    data: { user: alice, ...(overrides.data ?? {}) },
    rooms: new Set<string>(),
    handshake: { headers: { cookie: 'access=token' } },
    join: jest.fn(),
    leave: jest.fn(),
    to: jest.fn().mockReturnValue({ emit: jest.fn() }),
    emit: jest.fn(),
    disconnect: jest.fn(),
  } as unknown as Socket;
}

describe('VoiceRoomsGateway', () => {
  let gateway: VoiceRoomsGateway;
  let authService: { getUserFromRawCookies: jest.Mock };
  let eventEmitter: { emit: jest.Mock };
  let voiceRoomsStateService: {
    ensureRoom: jest.Mock;
    getRoom: jest.Mock;
    getPeersOnJoin: jest.Mock;
    removeRoom: jest.Mock;
    resolveIdentityFromKey: jest.Mock;
    createGroupIdentity: jest.Mock;
  };
  let directCallsStateService: {
    create: jest.Mock;
    get: jest.Mock;
    accept: jest.Mock;
    cancel: jest.Mock;
    end: jest.Mock;
    isParticipant: jest.Mock;
    findActiveBetween: jest.Mock;
    findActiveForUser: jest.Mock;
  };
  let serverMock: {
    to: jest.Mock;
    emit: jest.Mock;
    sockets: { sockets: Map<string, Socket> };
  };

  beforeEach(() => {
    authService = {
      getUserFromRawCookies: jest.fn(),
    };
    eventEmitter = { emit: jest.fn() };
    voiceRoomsStateService = {
      ensureRoom: jest.fn(),
      getRoom: jest.fn(),
      getPeersOnJoin: jest.fn().mockReturnValue({ peers: [] }),
      removeRoom: jest.fn(),
      resolveIdentityFromKey: jest.fn(),
      createGroupIdentity: jest.fn((roomId: number) => ({
        type: EVoiceSessionType.GROUP_ROOM,
        roomId,
      })),
    };
    directCallsStateService = {
      create: jest.fn(),
      get: jest.fn(),
      accept: jest.fn(),
      cancel: jest.fn(),
      end: jest.fn(),
      isParticipant: jest.fn(),
      findActiveBetween: jest.fn(),
      findActiveForUser: jest.fn(),
    };

    gateway = new VoiceRoomsGateway(
      authService as unknown as AuthService,
      {} as never,
      voiceRoomsStateService as unknown as VoiceRoomsStateService,
      directCallsStateService as unknown as DirectCallsStateService,
      eventEmitter as never,
    );

    serverMock = {
      to: jest.fn().mockReturnThis(),
      emit: jest.fn(),
      sockets: { sockets: new Map() },
    };
    Object.assign(gateway, { server: serverMock as unknown as Server });
  });

  describe('connection', () => {
    it('authorizes the socket and joins the user room', async () => {
      authService.getUserFromRawCookies.mockResolvedValue(alice);
      const client = createSocket({ data: {} });

      await gateway.handleConnection(client as never);

      expect(client.data.user).toEqual(alice);
      expect(client.join).toHaveBeenCalledWith('7');
      expect(client.disconnect).not.toHaveBeenCalled();
    });

    it('rejects unauthorized connections', async () => {
      authService.getUserFromRawCookies.mockResolvedValue(null);
      const client = createSocket({ data: {} });

      await gateway.handleConnection(client as never);

      expect(client.emit).toHaveBeenCalledWith(EVoiceRoomEvent.ERROR, {
        message: 'Unauthorized',
      });
      expect(client.disconnect).toHaveBeenCalledWith(true);
    });
  });

  describe('join / leave', () => {
    it('joins a group room by roomId and emits PEERS_ON_JOIN', async () => {
      const room = createRoom();
      voiceRoomsStateService.ensureRoom.mockResolvedValue(room);
      const socket = createSocket();

      await gateway.handleJoinRoom(socket as never, { roomId: 1 });

      expect(voiceRoomsStateService.createGroupIdentity).toHaveBeenCalledWith(
        1,
      );
      expect(room.peers.has('socket-1')).toBe(true);
      expect(socket.data.sessionKey).toBe('room:1');
      expect(socket.join).toHaveBeenCalledWith('room:1');
      expect(socket.join).toHaveBeenCalledWith('1');
      expect(socket.emit).toHaveBeenCalledWith(EVoiceRoomEvent.PEERS_ON_JOIN, {
        peers: [],
      });
    });

    it('rejects join without room or session', async () => {
      const socket = createSocket();

      await expect(
        gateway.handleJoinRoom(socket as never, {} as never),
      ).rejects.toThrow('No room or session provided to join');
    });

    it('rejects joining a direct call that is not active for the user', async () => {
      directCallsStateService.get.mockReturnValue({
        callId: 'c1',
        status: 'ringing',
        callerId: alice.id,
        recipientId: bob.id,
      });
      directCallsStateService.isParticipant.mockReturnValue(true);
      const socket = createSocket();

      await expect(
        gateway.handleJoinRoom(socket as never, {
          sessionTarget: {
            type: EVoiceSessionType.DIRECT_CALL,
            callId: 'c1',
            interlocutorId: bob.id,
          },
        }),
      ).rejects.toThrow('Direct call is not available to join');
    });

    it('joins an active direct call session', async () => {
      const call = {
        callId: 'c1',
        status: 'active',
        callerId: alice.id,
        recipientId: bob.id,
      };
      directCallsStateService.get.mockReturnValue(call);
      directCallsStateService.isParticipant.mockReturnValue(true);
      const room = createRoom();
      room.id = 'call:c1';
      voiceRoomsStateService.ensureRoom.mockResolvedValue(room);
      const socket = createSocket();

      await gateway.handleJoinRoom(socket as never, {
        sessionTarget: {
          type: EVoiceSessionType.DIRECT_CALL,
          callId: 'c1',
          interlocutorId: bob.id,
        },
      });

      expect(socket.data.sessionKey).toBe('call:c1');
      expect(socket.join).toHaveBeenCalledWith('call:c1');
      expect(room.peers.has('socket-1')).toBe(true);
    });

    it('evicts an existing same-user peer before joining so PEER_LEFT precedes PEER_JOINED', async () => {
      const oldProducer = {
        id: 'old-producer',
        close: jest.fn(),
      };
      const oldPeer = {
        id: 'old-socket',
        user: alice,
        producers: new Map([['old-producer', oldProducer]]),
        consumers: new Map(),
        sendTransport: { close: jest.fn() },
        recvTransport: { close: jest.fn() },
      };
      const room = createRoom(new Map([['old-socket', oldPeer]]));
      room.producers.set('old-producer', oldProducer);
      voiceRoomsStateService.ensureRoom.mockResolvedValue(room);

      const oldSocket = createSocket({
        id: 'old-socket',
        data: {
          user: alice,
          sessionKey: 'room:1',
          roomId: 1,
          sessionTarget: { type: EVoiceSessionType.GROUP_ROOM, roomId: 1 },
        },
      });
      serverMock.sockets.sockets.set('old-socket', oldSocket);

      const joiningSocket = createSocket({ id: 'new-socket' });

      await gateway.handleJoinRoom(joiningSocket as never, { roomId: 1 });

      expect(room.peers.has('old-socket')).toBe(false);
      expect(room.peers.has('new-socket')).toBe(true);
      expect(oldProducer.close).toHaveBeenCalled();
      expect(oldSocket.leave).toHaveBeenCalledWith('room:1');
      expect(oldSocket.data.sessionKey).toBeUndefined();

      expect(serverMock.emit).toHaveBeenCalledWith(
        EVoiceRoomEvent.PRODUCER_CLOSED,
        { producerId: 'old-producer', userId: alice.id },
      );
      expect(serverMock.emit).toHaveBeenCalledWith(
        EVoiceRoomEvent.PEER_LEFT,
        expect.objectContaining({
          user: alice,
          roomId: 1,
          sessionKey: 'room:1',
        }),
      );

      const peerJoinedEmit = (joiningSocket.to as jest.Mock).mock.results[0]
        ?.value.emit as jest.Mock;
      expect(peerJoinedEmit).toHaveBeenCalledWith(
        EVoiceRoomEvent.PEER_JOINED,
        expect.objectContaining({
          user: alice,
          roomId: 1,
          sessionKey: 'room:1',
        }),
      );
    });

    it('does not end the room when eviction leaves other participants', async () => {
      const oldPeer = {
        id: 'old-socket',
        user: alice,
        producers: new Map(),
        consumers: new Map(),
      };
      const otherPeer = {
        id: 'other-socket',
        user: bob,
        producers: new Map(),
        consumers: new Map(),
      };
      const room = createRoom(
        new Map([
          ['old-socket', oldPeer],
          ['other-socket', otherPeer],
        ]),
      );
      voiceRoomsStateService.ensureRoom.mockResolvedValue(room);

      await gateway.handleJoinRoom(
        createSocket({ id: 'new-socket' }) as never,
        {
          roomId: 1,
        },
      );

      expect(room.peers.size).toBe(2);
      expect(room.peers.has('other-socket')).toBe(true);
      expect(room.peers.has('new-socket')).toBe(true);
      expect(voiceRoomsStateService.removeRoom).not.toHaveBeenCalled();
    });

    it('leaves a room, closes media, and notifies remaining peers', () => {
      const producer = { id: 'p1', close: jest.fn() };
      const consumer = { close: jest.fn() };
      const peer = {
        id: 'socket-1',
        user: alice,
        producers: new Map([['p1', producer]]),
        consumers: new Map([['c1', consumer]]),
        sendTransport: { close: jest.fn() },
        recvTransport: { close: jest.fn() },
      };
      const otherPeer = {
        id: 'socket-2',
        user: bob,
        producers: new Map(),
        consumers: new Map(),
      };
      const room = createRoom(
        new Map([
          ['socket-1', peer],
          ['socket-2', otherPeer],
        ]),
      );
      room.producers.set('p1', producer);
      voiceRoomsStateService.getRoom.mockReturnValue(room);

      const socket = createSocket({
        data: {
          user: alice,
          sessionKey: 'room:1',
          roomId: 1,
          sessionTarget: { type: EVoiceSessionType.GROUP_ROOM, roomId: 1 },
        },
      });
      const toEmit = jest.fn();
      (socket.to as jest.Mock).mockReturnValue({ emit: toEmit });

      gateway.handleLeaveRoom(socket as never);

      expect(consumer.close).toHaveBeenCalled();
      expect(producer.close).toHaveBeenCalled();
      expect(room.peers.has('socket-1')).toBe(false);
      expect(voiceRoomsStateService.removeRoom).not.toHaveBeenCalled();
      expect(toEmit).toHaveBeenCalledWith(EVoiceRoomEvent.PRODUCER_CLOSED, {
        producerId: 'p1',
        userId: alice.id,
      });
      expect(toEmit).toHaveBeenCalledWith(
        EVoiceRoomEvent.PEER_LEFT,
        expect.objectContaining({
          user: alice,
          roomId: 1,
          sessionKey: 'room:1',
        }),
      );
    });

    it('removes an empty direct-call room and emits CALL_ENDED', () => {
      const peer = {
        id: 'socket-1',
        user: alice,
        producers: new Map(),
        consumers: new Map(),
      };
      const room = createRoom(new Map([['socket-1', peer]]));
      room.id = 'call:c1';
      voiceRoomsStateService.getRoom.mockImplementation((key: string) =>
        key === 'call:c1' && room.peers.size > 0 ? room : undefined,
      );
      directCallsStateService.end.mockReturnValue({
        callId: 'c1',
        callerId: alice.id,
        recipientId: bob.id,
        status: 'active',
      });

      const socket = createSocket({
        data: {
          user: alice,
          sessionKey: 'call:c1',
          sessionTarget: {
            type: EVoiceSessionType.DIRECT_CALL,
            callId: 'c1',
          },
        },
      });
      (socket.to as jest.Mock).mockReturnValue({ emit: jest.fn() });

      gateway.handleLeaveRoom(socket as never);

      expect(voiceRoomsStateService.removeRoom).toHaveBeenCalledWith('call:c1');
      expect(directCallsStateService.end).toHaveBeenCalledWith('c1');
      expect(serverMock.to).toHaveBeenCalledWith('7');
      expect(serverMock.to).toHaveBeenCalledWith('8');
      expect(serverMock.emit).toHaveBeenCalledWith(
        EDirectCallEvent.CALL_ENDED,
        {
          callId: 'c1',
        },
      );
    });
  });

  describe('direct call signaling', () => {
    it('initiates a ringing call and notifies the recipient', () => {
      directCallsStateService.create.mockReturnValue({
        callId: 'c1',
        status: 'ringing',
        callerId: alice.id,
        recipientId: bob.id,
      });
      const socket = createSocket();

      const result = gateway.handleCallInitiate(socket as never, {
        recipientId: bob.id,
      });

      expect(result).toEqual({ callId: 'c1' });
      expect(serverMock.to).toHaveBeenCalledWith('8');
      expect(serverMock.emit).toHaveBeenCalledWith(
        EDirectCallEvent.CALL_INCOMING,
        { callId: 'c1', caller: alice },
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        NotificationsDomainEvents.DIRECT_CALL,
        {
          recipientId: bob.id,
          callerId: alice.id,
          callerUsername: alice.username,
          callId: 'c1',
        },
      );
    });

    it('returns alreadyActive when reusing an active call', () => {
      directCallsStateService.create.mockReturnValue({
        callId: 'c1',
        status: 'active',
        callerId: alice.id,
        recipientId: bob.id,
      });

      const result = gateway.handleCallInitiate(createSocket() as never, {
        recipientId: bob.id,
      });

      expect(result).toEqual({ callId: 'c1', alreadyActive: true });
      expect(serverMock.emit).not.toHaveBeenCalled();
    });

    it('accepts a call and notifies the caller', () => {
      directCallsStateService.accept.mockReturnValue({
        callId: 'c1',
        status: 'active',
        callerId: alice.id,
        recipientId: bob.id,
      });
      const socket = createSocket({ data: { user: bob } });

      const result = gateway.handleCallAccept(socket as never, {
        callId: 'c1',
        callerId: alice.id,
      });

      expect(result).toEqual({});
      expect(serverMock.to).toHaveBeenCalledWith('7');
      expect(serverMock.emit).toHaveBeenCalledWith(
        EDirectCallEvent.CALL_ACCEPTED,
        { callId: 'c1', recipient: bob },
      );
    });

    it('rejects accept when the call is missing', () => {
      directCallsStateService.accept.mockReturnValue(undefined);

      expect(
        gateway.handleCallAccept(
          createSocket({ data: { user: bob } }) as never,
          {
            callId: 'missing',
            callerId: alice.id,
          },
        ),
      ).toEqual({ error: 'Call not found or already ended' });
    });

    it('rejects a ringing call and notifies the caller', () => {
      directCallsStateService.cancel.mockReturnValue({
        callId: 'c1',
        status: 'ringing',
        callerId: alice.id,
        recipientId: bob.id,
      });

      gateway.handleCallReject(createSocket({ data: { user: bob } }) as never, {
        callId: 'c1',
        callerId: alice.id,
        reason: 'busy',
      });

      expect(serverMock.to).toHaveBeenCalledWith('7');
      expect(serverMock.emit).toHaveBeenCalledWith(
        EDirectCallEvent.CALL_REJECTED,
        { callId: 'c1', reason: 'busy' },
      );
    });

    it('hangs up only while ringing', () => {
      directCallsStateService.get.mockReturnValue({
        callId: 'c1',
        status: 'active',
        callerId: alice.id,
        recipientId: bob.id,
      });

      expect(
        gateway.handleCallHangup(createSocket() as never, {
          callId: 'c1',
          byUserId: alice.id,
        }),
      ).toEqual({});
      expect(directCallsStateService.cancel).not.toHaveBeenCalled();

      directCallsStateService.get.mockReturnValue({
        callId: 'c1',
        status: 'ringing',
        callerId: alice.id,
        recipientId: bob.id,
      });
      directCallsStateService.cancel.mockReturnValue({
        callId: 'c1',
        status: 'ringing',
        callerId: alice.id,
        recipientId: bob.id,
      });

      gateway.handleCallHangup(createSocket() as never, {
        callId: 'c1',
        byUserId: alice.id,
      });

      expect(serverMock.to).toHaveBeenCalledWith('8');
      expect(serverMock.emit).toHaveBeenCalledWith(
        EDirectCallEvent.CALL_HANGUP,
        {
          callId: 'c1',
          byUserId: alice.id,
        },
      );
    });

    it('returns the active call for a user or pair', () => {
      const call = {
        callId: 'c1',
        status: 'active',
        callerId: alice.id,
        recipientId: bob.id,
      };
      directCallsStateService.findActiveForUser.mockReturnValue(call);
      directCallsStateService.findActiveBetween.mockReturnValue(call);

      expect(gateway.handleCallGetActive(createSocket() as never, {})).toEqual({
        callId: 'c1',
        callerId: alice.id,
        recipientId: bob.id,
      });
      expect(directCallsStateService.findActiveForUser).toHaveBeenCalledWith(
        alice.id,
      );

      expect(
        gateway.handleCallGetActive(createSocket() as never, {
          interlocutorId: bob.id,
        }),
      ).toEqual({
        callId: 'c1',
        callerId: alice.id,
        recipientId: bob.id,
      });
      expect(directCallsStateService.findActiveBetween).toHaveBeenCalledWith(
        alice.id,
        bob.id,
      );
    });

    it('returns null when there is no active call', () => {
      directCallsStateService.findActiveForUser.mockReturnValue(undefined);

      expect(
        gateway.handleCallGetActive(createSocket() as never, {}),
      ).toBeNull();
    });
  });
});
