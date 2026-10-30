jest.mock('@mikro-orm/nestjs', () => ({
  InjectRepository: () => () => undefined,
}));
jest.mock('../auth/auth.service', () => ({
  AuthService: class {},
}));
jest.mock('@shared/services/app.service', () => ({
  AppService: class {},
}));
jest.mock('../rooms/rooms.facade', () => ({
  RoomsFacade: class {},
}));
// Keep mediasoup out of Jest resolution (node10 / package exports). Specs mock state.
jest.mock('mediasoup', () => ({
  createWorker: jest.fn(),
}));
jest.mock('mediasoup/types', () => ({}), { virtual: true });
jest.mock('./webrtc-listen-infos', () => ({
  ...jest.requireActual('./webrtc-listen-infos'),
  resolveAnnouncedAddresses: jest.fn(
    async (addresses: { address: string; portRange: unknown }[]) =>
      addresses.map((announced) =>
        announced.address === 'my.ddns.example'
          ? { ...announced, address: '203.0.113.5' }
          : announced,
      ),
  ),
}));

import { VoiceRoomsGateway } from './voice-rooms.gateway';
import { VoiceRoomsStateService } from './voice-rooms.state';
import { DirectCallsStateService } from './direct-calls.state';
import { AuthService } from '../auth/auth.service';
import {
  DIRECT_CALL_RING_TIMEOUT_MS,
  EDirectCallEvent,
  EUserRole,
  EVoiceRoomEvent,
  ApiErrorCode,
  EPermission,
  EVoiceSessionType,
  type IUserSafe,
  type TVoiceRoomProduce,
} from '@konvoez/shared';
import { VoiceRoomsDomainEvents } from './voice-rooms.events';
import { AppException } from '@shared/errors/app.exception';
import { Mutex } from 'async-mutex';
import { Server, Socket } from 'socket.io';

const alice: IUserSafe = {
  id: 7,
  username: 'alice',
  fullname: 'Alice',
  avatarUrl: null,
  role: EUserRole.MEMBER,
  isOwner: false,
  roles: [],
  permissions: [EPermission.CONNECT_VOICE],
  createdAt: new Date(),
  updatedAt: new Date(),
};

const bob: IUserSafe = {
  ...alice,
  id: 8,
  username: 'bob',
  fullname: 'Bob',
};

function createRoom(peers: Map<string, unknown> = new Map()) {
  return {
    id: 'room:1',
    peers,
    producers: new Map(),
    produceMutex: new Mutex(),
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
  let authService: {
    getUserFromRawCookies: jest.Mock;
    getActiveUserById: jest.Mock;
  };
  let eventEmitter: { emit: jest.Mock };
  let voiceRoomsStateService: {
    ensureRoom: jest.Mock;
    getRoom: jest.Mock;
    getPeersOnJoin: jest.Mock;
    removeRoom: jest.Mock;
    resolveIdentityFromKey: jest.Mock;
    createGroupIdentity: jest.Mock;
    createLobbyPeerJoined: jest.Mock;
    createLobbyPeerLeft: jest.Mock;
    createLobbyPeerMuted: jest.Mock;
  };
  let directCallsStateService: {
    create: jest.Mock;
    get: jest.Mock;
    accept: jest.Mock;
    reject: jest.Mock;
    cancel: jest.Mock;
    end: jest.Mock;
    isParticipant: jest.Mock;
    findActiveBetween: jest.Mock;
    findActiveForUser: jest.Mock;
    findRingingByCaller: jest.Mock;
  };
  let serverMock: {
    to: jest.Mock;
    emit: jest.Mock;
    in: jest.Mock;
    fetchSockets?: jest.Mock;
    sockets: { sockets: Map<string, Socket> };
  };
  let fetchSockets: jest.Mock;

  beforeEach(() => {
    authService = {
      getUserFromRawCookies: jest.fn(),
      getActiveUserById: jest.fn().mockImplementation((id: number) => {
        if (id === alice.id) return Promise.resolve(alice);
        if (id === bob.id) return Promise.resolve(bob);
        return Promise.resolve({ ...alice, id });
      }),
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
      createLobbyPeerJoined: jest.fn((roomId: number, user: IUserSafe) => ({
        roomId,
        user,
        epoch: 'epoch-1',
        revision: 1,
      })),
      createLobbyPeerLeft: jest.fn((roomId: number, userId: number) => ({
        roomId,
        userId,
        epoch: 'epoch-1',
        revision: 1,
      })),
      createLobbyPeerMuted: jest.fn(
        (
          roomId: number,
          userId: number,
          muted: boolean,
          deafened: boolean,
        ) => ({
          roomId,
          userId,
          muted,
          deafened,
          epoch: 'epoch-1',
          revision: 1,
        }),
      ),
    };
    directCallsStateService = {
      create: jest.fn(),
      get: jest.fn(),
      accept: jest.fn(),
      reject: jest.fn(),
      cancel: jest.fn(),
      end: jest.fn(),
      isParticipant: jest.fn(),
      findActiveBetween: jest.fn(),
      findActiveForUser: jest.fn(),
      findRingingByCaller: jest.fn().mockReturnValue([]),
    };

    const roomsFacadeMock = {
      assertCanAccessRoom: jest.fn().mockResolvedValue(undefined),
    };

    gateway = new VoiceRoomsGateway(
      authService as unknown as AuthService,
      {} as never,
      roomsFacadeMock as never,
      voiceRoomsStateService as unknown as VoiceRoomsStateService,
      directCallsStateService as unknown as DirectCallsStateService,
      eventEmitter as never,
    );

    fetchSockets = jest.fn().mockResolvedValue([]);
    serverMock = {
      to: jest.fn().mockReturnThis(),
      emit: jest.fn(),
      in: jest.fn().mockReturnValue({ fetchSockets }),
      fetchSockets,
      sockets: { sockets: new Map() },
    };
    Object.assign(gateway, { server: serverMock as unknown as Server });
  });

  it('acknowledges the liveness ping', () => {
    expect(gateway.handlePing()).toEqual({});
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

  describe('transports', () => {
    it('creates a WebRTC transport on every announced address and range', async () => {
      const lanOnly = { min: 40050, max: 40100 };
      const shared = { min: 40000, max: 40100 };
      Object.assign(gateway, {
        appService: {
          MEDIASOUP_ANNOUNCED_ADDRESSES: [
            { address: '192.168.0.10', portRange: lanOnly },
            { address: 'my.ddns.example', portRange: shared },
          ],
        },
      });
      const transport = {
        id: 't1',
        iceParameters: {},
        iceCandidates: [],
        dtlsParameters: {},
        sctpParameters: undefined,
        on: jest.fn(),
      };
      const createWebRtcTransport = jest.fn().mockResolvedValue(transport);
      const peer = { id: 'socket-1' };
      voiceRoomsStateService.getRoom.mockReturnValue({
        ...createRoom(new Map([['socket-1', peer]])),
        router: { createWebRtcTransport },
      });
      const socket = createSocket({ data: { sessionKey: 'room:1' } });
      socket.rooms.add('room:1');

      await gateway.handleCreateTransport(socket as never, {
        direction: 'send',
      });

      expect(createWebRtcTransport).toHaveBeenCalledWith({
        listenInfos: [
          {
            protocol: 'udp',
            ip: '0.0.0.0',
            announcedAddress: '192.168.0.10',
            portRange: lanOnly,
          },
          {
            protocol: 'udp',
            ip: '0.0.0.0',
            announcedAddress: '203.0.113.5',
            portRange: shared,
          },
          {
            protocol: 'tcp',
            ip: '0.0.0.0',
            announcedAddress: '192.168.0.10',
            portRange: lanOnly,
          },
          {
            protocol: 'tcp',
            ip: '0.0.0.0',
            announcedAddress: '203.0.113.5',
            portRange: shared,
          },
        ],
      });
      expect(peer).toEqual({ id: 'socket-1', sendTransport: transport });
    });

    it('rejects connectTransport with AppException when transport is not found', async () => {
      const room = createRoom(
        new Map([['socket-1', { id: 'socket-1', user: alice }]]),
      );
      voiceRoomsStateService.getRoom.mockReturnValue(room);
      const socket = createSocket({
        data: {
          user: alice,
          sessionKey: 'room:1',
          roomId: 1,
        },
      });
      socket.rooms.add('room:1');

      await expect(
        gateway.connectTransport(socket as never, {
          transportId: 'unknown',
          dtlsParameters: {} as never,
        }),
      ).rejects.toThrow(AppException);
    });
  });

  describe('resume', () => {
    it('reports an active session when the socket is a room peer', () => {
      voiceRoomsStateService.getRoom.mockReturnValue(
        createRoom(new Map([['socket-1', { id: 'socket-1', user: alice }]])),
      );
      const socket = createSocket({ data: { sessionKey: 'room:1' } });

      expect(gateway.handleSessionCheck(socket as never)).toEqual({
        active: true,
      });
    });

    it('reports an inactive session when the peer is gone', () => {
      voiceRoomsStateService.getRoom.mockReturnValue(createRoom());
      const socket = createSocket({ data: { sessionKey: 'room:1' } });

      expect(gateway.handleSessionCheck(socket as never)).toEqual({
        active: false,
      });
    });

    it('reports an inactive session for a socket without a session', () => {
      const socket = createSocket({ data: {} });

      expect(gateway.handleSessionCheck(socket as never)).toEqual({
        active: false,
      });
    });

    it('restarts ICE on the peer transport', async () => {
      const iceParameters = { usernameFragment: 'u', password: 'p' };
      const transport = {
        id: 't1',
        restartIce: jest.fn().mockResolvedValue(iceParameters),
      };
      voiceRoomsStateService.getRoom.mockReturnValue(
        createRoom(
          new Map([
            [
              'socket-1',
              { id: 'socket-1', user: alice, recvTransport: transport },
            ],
          ]),
        ),
      );
      const socket = createSocket({ data: { sessionKey: 'room:1' } });
      socket.rooms.add('room:1');

      await expect(
        gateway.handleRestartIce(socket as never, { transportId: 't1' }),
      ).resolves.toEqual({ iceParameters });
      expect(transport.restartIce).toHaveBeenCalled();
    });

    it('rejects restartIce for an unknown transport', async () => {
      voiceRoomsStateService.getRoom.mockReturnValue(
        createRoom(new Map([['socket-1', { id: 'socket-1', user: alice }]])),
      );
      const socket = createSocket({ data: { sessionKey: 'room:1' } });
      socket.rooms.add('room:1');

      await expect(
        gateway.handleRestartIce(socket as never, { transportId: 'x' }),
      ).rejects.toThrow(AppException);
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
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        VoiceRoomsDomainEvents.VOICE_ROOM_PEER_JOINED,
        { roomId: 1, user: alice, epoch: 'epoch-1', revision: 1 },
      );
    });

    it('rejects join without room or session', async () => {
      const socket = createSocket();

      await expect(
        gateway.handleJoinRoom(socket as never, {} as never),
      ).rejects.toThrow('No room or session provided to join');
    });

    it('rejects join when socket has no user data', async () => {
      const socket = createSocket({ data: { user: undefined } });

      await expect(
        gateway.handleJoinRoom(socket as never, { roomId: 1 }),
      ).rejects.toMatchObject({
        code: ApiErrorCode.UNAUTHORIZED,
      });
    });

    it('rejects join when fresh user lacks CONNECT_VOICE permission', async () => {
      const socket = createSocket();
      authService.getActiveUserById.mockResolvedValueOnce({
        ...alice,
        isOwner: false,
        permissions: [],
      });

      await expect(
        gateway.handleJoinRoom(socket as never, { roomId: 1 }),
      ).rejects.toMatchObject({
        code: ApiErrorCode.ROOM_ACCESS_DENIED,
      });
      expect(authService.getUserFromRawCookies).not.toHaveBeenCalled();
    });

    it('rejects join when fresh user lookup fails', async () => {
      const socket = createSocket();
      authService.getActiveUserById.mockRejectedValueOnce(
        AppException.unauthorized(ApiErrorCode.UNAUTHORIZED, 'Unauthorized'),
      );

      await expect(
        gateway.handleJoinRoom(socket as never, { roomId: 1 }),
      ).rejects.toMatchObject({
        code: ApiErrorCode.UNAUTHORIZED,
      });
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
      expect(eventEmitter.emit).not.toHaveBeenCalledWith(
        VoiceRoomsDomainEvents.VOICE_ROOM_PEER_JOINED,
        expect.anything(),
      );
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
        { producerId: 'old-producer', userId: alice.id, reason: 'peer-left' },
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
      expect(eventEmitter.emit).not.toHaveBeenCalledWith(
        VoiceRoomsDomainEvents.VOICE_ROOM_PEER_JOINED,
        expect.anything(),
      );
      expect(eventEmitter.emit).not.toHaveBeenCalledWith(
        VoiceRoomsDomainEvents.VOICE_ROOM_PEER_LEFT,
        expect.anything(),
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
        reason: 'peer-left',
      });
      expect(toEmit).toHaveBeenCalledWith(
        EVoiceRoomEvent.PEER_LEFT,
        expect.objectContaining({
          user: alice,
          roomId: 1,
          sessionKey: 'room:1',
        }),
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        VoiceRoomsDomainEvents.VOICE_ROOM_PEER_LEFT,
        { roomId: 1, userId: alice.id, epoch: 'epoch-1', revision: 1 },
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

  describe('produce / closeProducer', () => {
    function readyPeer(overrides: Record<string, unknown> = {}) {
      const sendTransport = {
        produce: jest.fn(),
      };
      const peer = {
        id: 'socket-1',
        user: alice,
        producers: new Map(),
        consumers: new Map(),
        sendTransport,
        ...overrides,
      };
      const room = createRoom(new Map([['socket-1', peer]]));
      return { peer, room, sendTransport };
    }

    function joinedSocket() {
      const socket = createSocket({
        data: {
          user: alice,
          sessionKey: 'room:1',
          roomId: 1,
          sessionTarget: { type: EVoiceSessionType.GROUP_ROOM, roomId: 1 },
        },
      });
      socket.rooms.add('room:1');
      return socket;
    }

    it('rejects unknown mediaTag with AppException', async () => {
      const { room } = readyPeer();
      voiceRoomsStateService.getRoom.mockReturnValue(room);
      await expect(
        gateway.produce(joinedSocket() as never, {
          transportId: 't',
          kind: 'audio',
          mediaTag: 'webcam' as never,
          rtpParameters: {},
        }),
      ).rejects.toThrow(AppException);
    });

    it('rejects kind/mediaTag mismatch with AppException', async () => {
      const { room } = readyPeer();
      voiceRoomsStateService.getRoom.mockReturnValue(room);
      await expect(
        gateway.produce(joinedSocket() as never, {
          transportId: 't',
          kind: 'audio',
          mediaTag: 'cam',
          rtpParameters: {},
        }),
      ).rejects.toThrow(AppException);
    });

    it('rejects screen-audio without screen with AppException', async () => {
      const { room } = readyPeer();
      voiceRoomsStateService.getRoom.mockReturnValue(room);
      await expect(
        gateway.produce(joinedSocket() as never, {
          transportId: 't',
          kind: 'audio',
          mediaTag: 'screen-audio',
          rtpParameters: {},
        }),
      ).rejects.toThrow(AppException);
    });

    it('rejects produce with AppException when send transport is missing', async () => {
      const { room } = readyPeer({ sendTransport: undefined });
      voiceRoomsStateService.getRoom.mockReturnValue(room);
      await expect(
        gateway.produce(joinedSocket() as never, {
          transportId: 't',
          kind: 'audio',
          mediaTag: 'mic',
          rtpParameters: {},
        }),
      ).rejects.toThrow(AppException);
    });

    it('enforces room video producer limit of 4', async () => {
      const { peer, room, sendTransport } = readyPeer();
      for (let i = 0; i < 4; i += 1) {
        const p = {
          id: `v${i}`,
          kind: 'video',
          closed: false,
          appData: { mediaTag: 'cam', peerId: `other-${i}` },
          close: jest.fn(),
          observer: { on: jest.fn() },
          on: jest.fn(),
        };
        room.producers.set(p.id, p);
      }
      voiceRoomsStateService.getRoom.mockReturnValue(room);

      await expect(
        gateway.produce(joinedSocket() as never, {
          transportId: 't',
          kind: 'video',
          mediaTag: 'cam',
          rtpParameters: {},
        }),
      ).rejects.toMatchObject({
        code: ApiErrorCode.VOICE_VIDEO_LIMIT_REACHED,
        message: 'Room video producer limit reached',
      });
      expect(sendTransport.produce).not.toHaveBeenCalled();
      expect(peer.producers.size).toBe(0);
    });

    it('allows replacing own cam when room already has 4 video producers', async () => {
      const { peer, room, sendTransport } = readyPeer();
      const existingCam = {
        id: 'cam-old',
        kind: 'video',
        closed: false,
        appData: { mediaTag: 'cam', peerId: 'socket-1' },
        close: jest.fn(function (this: { closed: boolean }) {
          this.closed = true;
        }),
        observer: { on: jest.fn() },
        on: jest.fn(),
      };
      peer.producers.set('cam-old', existingCam);
      room.producers.set('cam-old', existingCam);

      for (let i = 0; i < 3; i += 1) {
        const p = {
          id: `v${i}`,
          kind: 'video',
          closed: false,
          appData: { mediaTag: 'cam', peerId: `other-${i}` },
          close: jest.fn(),
          observer: { on: jest.fn() },
          on: jest.fn(),
        };
        room.producers.set(p.id, p);
      }

      const newCam = {
        id: 'cam-new',
        kind: 'video',
        closed: false,
        appData: { mediaTag: 'cam', peerId: 'socket-1' },
        close: jest.fn(),
        observer: { on: jest.fn() },
        on: jest.fn(),
      };
      sendTransport.produce.mockResolvedValue(newCam);
      voiceRoomsStateService.getRoom.mockReturnValue(room);
      const socket = joinedSocket();
      (socket.to as jest.Mock).mockReturnValue({ emit: jest.fn() });

      const result = await gateway.produce(socket as never, {
        transportId: 't',
        kind: 'video',
        mediaTag: 'cam',
        rtpParameters: {},
      });

      expect(result.producerId).toBe('cam-new');
      expect(existingCam.close).toHaveBeenCalled();
      expect(room.producers.has('cam-old')).toBe(false);
      expect(peer.producers.get('cam-new')).toBe(newCam);
      expect(
        [...room.producers.values()].filter(
          (p) => !p.closed && p.kind === 'video',
        ).length,
      ).toBe(4);
      expect(sendTransport.produce).toHaveBeenCalled();
    });

    it('serializes concurrent video produces and rejects when limit is exceeded', async () => {
      const room = createRoom();
      const sendTransport = {
        produce: jest
          .fn()
          .mockImplementation(
            async ({
              appData,
              kind,
            }: {
              appData: { peerId: string; mediaTag: string };
              kind: string;
            }) => {
              await new Promise((resolve) => setTimeout(resolve, 5));
              const p = {
                id: `prod-${appData.peerId}`,
                kind,
                closed: false,
                appData,
                close: jest.fn(),
                observer: { on: jest.fn() },
                on: jest.fn(),
              };
              return p;
            },
          ),
      };

      const sockets: Socket[] = [];
      for (let i = 0; i < 5; i += 1) {
        const user: IUserSafe = { ...alice, id: 10 + i, username: `user-${i}` };
        const peer = {
          id: `socket-${i}`,
          user,
          producers: new Map(),
          consumers: new Map(),
          sendTransport,
        };
        room.peers.set(`socket-${i}`, peer);
        const socket = createSocket({
          id: `socket-${i}`,
          data: {
            user,
            sessionKey: 'room:1',
            roomId: 1,
            sessionTarget: { type: EVoiceSessionType.GROUP_ROOM, roomId: 1 },
          },
        });
        socket.rooms.add('room:1');
        sockets.push(socket);
      }
      voiceRoomsStateService.getRoom.mockReturnValue(room);

      const results = await Promise.allSettled(
        sockets.map((s) =>
          gateway.produce(s as never, {
            transportId: 't',
            kind: 'video',
            mediaTag: 'cam',
            rtpParameters: {},
          }),
        ),
      );

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      expect(fulfilled).toHaveLength(4);
      expect(rejected).toHaveLength(1);
      expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(
        AppException,
      );
      expect(
        ((rejected[0] as PromiseRejectedResult).reason as AppException).code,
      ).toBe(ApiErrorCode.VOICE_VIDEO_LIMIT_REACHED);
      expect(room.producers.size).toBe(4);
    });

    it('serializes overlapping PRODUCE calls with the same tag, leaving one open producer', async () => {
      const { peer, room } = readyPeer();
      let callCount = 0;
      const producersCreated: Array<{
        id: string;
        kind: string;
        closed: boolean;
        appData: { peerId: string; mediaTag: string };
        close: jest.Mock;
        observer: { on: jest.Mock };
        on: jest.Mock;
      }> = [];

      peer.sendTransport.produce.mockImplementation(
        async ({
          appData,
          kind,
        }: {
          appData: { peerId: string; mediaTag: string };
          kind: string;
        }) => {
          callCount += 1;
          const currentCount = callCount;
          await new Promise((resolve) => setTimeout(resolve, 10));
          const p = {
            id: `p-${currentCount}`,
            kind,
            closed: false,
            appData,
            close: jest.fn(function (this: { closed: boolean }) {
              this.closed = true;
            }),
            observer: { on: jest.fn() },
            on: jest.fn(),
          };
          producersCreated.push(p);
          return p;
        },
      );
      voiceRoomsStateService.getRoom.mockReturnValue(room);

      const socket = joinedSocket();
      const producePayload: TVoiceRoomProduce = {
        transportId: 't',
        kind: 'video',
        mediaTag: 'cam',
        rtpParameters: {},
      };

      const [res1, res2] = await Promise.all([
        gateway.produce(socket as never, producePayload),
        gateway.produce(socket as never, producePayload),
      ]);

      expect(res1.producerId).toBe('p-1');
      expect(res2.producerId).toBe('p-2');
      expect(producersCreated[0].close).toHaveBeenCalled();
      expect(producersCreated[0].closed).toBe(true);
      expect(peer.producers.size).toBe(1);
      expect(peer.producers.get('p-2')).toBeDefined();
      expect(room.producers.size).toBe(1);
      expect(room.producers.get('p-2')).toBeDefined();
    });

    it('produces camera and registers close observers', async () => {
      const { peer, room, sendTransport } = readyPeer();
      const observerHandlers: Record<string, () => void> = {};
      const producer = {
        id: 'cam-1',
        kind: 'video',
        closed: false,
        appData: { mediaTag: 'cam', peerId: 'socket-1' },
        close: jest.fn(function (this: { closed: boolean }) {
          this.closed = true;
          observerHandlers['close']?.();
        }),
        observer: {
          on: jest.fn((event: string, handler: () => void) => {
            observerHandlers[event] = handler;
          }),
        },
        on: jest.fn(),
      };
      sendTransport.produce.mockResolvedValue(producer);
      voiceRoomsStateService.getRoom.mockReturnValue(room);
      const socket = joinedSocket();
      const toEmit = jest.fn();
      (socket.to as jest.Mock).mockReturnValue({ emit: toEmit });

      const result = await gateway.produce(socket as never, {
        transportId: 't',
        kind: 'video',
        mediaTag: 'cam',
        rtpParameters: { encodings: [{}, {}] },
        layers: [
          { height: 360, fps: 30 },
          { height: 720, fps: 30 },
        ],
      });

      expect(result.producerId).toBe('cam-1');
      expect(sendTransport.produce).toHaveBeenCalledWith(
        expect.objectContaining({
          appData: expect.objectContaining({
            mediaTag: 'cam',
            layers: [
              { height: 360, fps: 30 },
              { height: 720, fps: 30 },
            ],
          }),
        }),
      );
      expect(peer.producers.get('cam-1')).toBe(producer);
      expect(room.producers.get('cam-1')).toBe(producer);
      expect(toEmit).toHaveBeenCalledWith(
        EVoiceRoomEvent.PRODUCER_CREATED,
        expect.objectContaining({ producerId: 'cam-1', mediaTag: 'cam' }),
      );

      const serverEmit = jest.fn();
      serverMock.to.mockReturnValue({ emit: serverEmit });

      await gateway.closeProducer(socket as never, { producerId: 'cam-1' });
      expect(producer.close).toHaveBeenCalled();
      expect(peer.producers.has('cam-1')).toBe(false);
      expect(room.producers.has('cam-1')).toBe(false);
      expect(serverEmit).toHaveBeenCalledWith(EVoiceRoomEvent.PRODUCER_CLOSED, {
        producerId: 'cam-1',
        userId: alice.id,
      });
    });

    it('rejects layers on audio and a video encoding count mismatch', async () => {
      const { room, sendTransport } = readyPeer();
      voiceRoomsStateService.getRoom.mockReturnValue(room);
      const socket = joinedSocket();

      await expect(
        gateway.produce(socket as never, {
          transportId: 't',
          kind: 'audio',
          mediaTag: 'mic',
          rtpParameters: {},
          layers: [{ height: 720, fps: 30 }],
        }),
      ).rejects.toBeInstanceOf(AppException);
      expect(sendTransport.produce).not.toHaveBeenCalled();

      await expect(
        gateway.produce(socket as never, {
          transportId: 't',
          kind: 'video',
          mediaTag: 'cam',
          rtpParameters: { encodings: [{}] },
          layers: [
            { height: 360, fps: 30 },
            { height: 720, fps: 30 },
          ],
        }),
      ).rejects.toBeInstanceOf(AppException);
      expect(sendTransport.produce).not.toHaveBeenCalled();
    });

    it('subscribes to producer score for mic and emits minimum score to owner socket only', async () => {
      const room = createRoom();
      const peer = {
        id: 'socket-1',
        user: alice,
        producers: new Map(),
        consumers: new Map(),
      };
      room.peers.set('socket-1', peer);

      let scoreHandler:
        ((scores: Array<{ score: number }>) => void) | undefined;
      const micProducer = {
        id: 'mic-1',
        kind: 'audio',
        closed: false,
        appData: { mediaTag: 'mic', peerId: 'socket-1' },
        close: jest.fn(),
        observer: { on: jest.fn() },
        on: jest.fn(
          (
            event: string,
            handler: (scores: Array<{ score: number }>) => void,
          ) => {
            if (event === 'score') {
              scoreHandler = handler;
            }
          },
        ),
      };

      const sendTransport = {
        produce: jest.fn().mockResolvedValue(micProducer),
      };
      (
        peer as unknown as { sendTransport: typeof sendTransport }
      ).sendTransport = sendTransport;
      voiceRoomsStateService.getRoom.mockReturnValue(room);

      const socket = joinedSocket();
      socket.connected = true;
      (socket.to as jest.Mock).mockReturnValue({ emit: jest.fn() });

      await gateway.produce(socket as never, {
        transportId: 't',
        kind: 'audio',
        mediaTag: 'mic',
        rtpParameters: {},
      });

      expect(micProducer.on).toHaveBeenCalledWith(
        'score',
        expect.any(Function),
      );
      expect(scoreHandler).toBeDefined();

      // Trigger score with multiple consumer scores; minimum should be picked
      scoreHandler?.([{ score: 9 }, { score: 4 }, { score: 7 }]);
      expect(socket.emit).toHaveBeenCalledWith(EVoiceRoomEvent.PRODUCER_SCORE, {
        producerId: 'mic-1',
        score: 4,
      });

      // Empty scores default to 10
      scoreHandler?.([]);
      expect(socket.emit).toHaveBeenCalledWith(EVoiceRoomEvent.PRODUCER_SCORE, {
        producerId: 'mic-1',
        score: 10,
      });

      // Emitted only to owner socket, not fan-out to room
      expect(socket.to('room:1').emit).not.toHaveBeenCalledWith(
        EVoiceRoomEvent.PRODUCER_SCORE,
        expect.anything(),
      );
    });

    it('closing screen also closes screen-audio and emits PRODUCER_CLOSED for both', async () => {
      const screenAudio = {
        id: 'screen-audio-1',
        kind: 'audio',
        closed: false,
        appData: { mediaTag: 'screen-audio', peerId: 'socket-1' },
        close: jest.fn(function (this: { closed: boolean }) {
          this.closed = true;
        }),
        observer: { on: jest.fn() },
        on: jest.fn(),
      };
      const screen = {
        id: 'screen-1',
        kind: 'video',
        closed: false,
        appData: { mediaTag: 'screen', peerId: 'socket-1' },
        close: jest.fn(function (this: { closed: boolean }) {
          this.closed = true;
        }),
        observer: { on: jest.fn() },
        on: jest.fn(),
      };
      const { peer, room } = readyPeer({
        producers: new Map([
          ['screen-1', screen],
          ['screen-audio-1', screenAudio],
        ]),
      });
      room.producers.set('screen-1', screen);
      room.producers.set('screen-audio-1', screenAudio);
      voiceRoomsStateService.getRoom.mockReturnValue(room);
      const socket = joinedSocket();
      const serverEmit = jest.fn();
      serverMock.to.mockReturnValue({ emit: serverEmit });

      await gateway.closeProducer(socket as never, { producerId: 'screen-1' });

      expect(screen.close).toHaveBeenCalled();
      expect(screenAudio.close).toHaveBeenCalled();
      expect(peer.producers.has('screen-1')).toBe(false);
      expect(peer.producers.has('screen-audio-1')).toBe(false);
      expect(serverEmit).toHaveBeenCalledWith(EVoiceRoomEvent.PRODUCER_CLOSED, {
        producerId: 'screen-audio-1',
        userId: alice.id,
      });
      expect(serverEmit).toHaveBeenCalledWith(EVoiceRoomEvent.PRODUCER_CLOSED, {
        producerId: 'screen-1',
        userId: alice.id,
      });
    });

    it('acknowledges closeProducer when the producer was already closed on the server', async () => {
      const screenAudio = {
        id: 'screen-audio-1',
        kind: 'audio',
        closed: true,
        appData: { mediaTag: 'screen-audio', peerId: 'socket-1' },
        close: jest.fn(),
        observer: { on: jest.fn() },
        on: jest.fn(),
      };
      const { peer, room } = readyPeer({
        producers: new Map([['screen-audio-1', screenAudio]]),
      });
      room.producers.set('screen-audio-1', screenAudio);
      voiceRoomsStateService.getRoom.mockReturnValue(room);
      const socket = joinedSocket();

      await expect(
        gateway.closeProducer(socket as never, {
          producerId: 'screen-audio-1',
        }),
      ).resolves.toEqual({});
      expect(screenAudio.close).not.toHaveBeenCalled();
      expect(peer.producers.has('screen-audio-1')).toBe(true);
    });
  });

  describe('closeConsumer', () => {
    it('closes a consumer owned by the peer', async () => {
      const consumer = { id: 'c1', closed: false, close: jest.fn() };
      const peer = {
        id: 'socket-1',
        user: alice,
        producers: new Map(),
        consumers: new Map([['c1', consumer]]),
      };
      const room = createRoom(new Map([['socket-1', peer]]));
      voiceRoomsStateService.getRoom.mockReturnValue(room);
      const socket = createSocket({
        data: {
          user: alice,
          sessionKey: 'room:1',
          roomId: 1,
        },
      });
      socket.rooms.add('room:1');

      await gateway.closeConsumer(socket as never, { consumerId: 'c1' });

      expect(consumer.close).toHaveBeenCalled();
      expect(peer.consumers.has('c1')).toBe(false);
    });

    it('acknowledges closeConsumer and removes it when the consumer was already closed', async () => {
      const consumer = { id: 'c1', closed: true, close: jest.fn() };
      const peer = {
        id: 'socket-1',
        user: alice,
        producers: new Map(),
        consumers: new Map([['c1', consumer]]),
      };
      const room = createRoom(new Map([['socket-1', peer]]));
      voiceRoomsStateService.getRoom.mockReturnValue(room);
      const socket = createSocket({
        data: {
          user: alice,
          sessionKey: 'room:1',
          roomId: 1,
        },
      });
      socket.rooms.add('room:1');

      await expect(
        gateway.closeConsumer(socket as never, { consumerId: 'c1' }),
      ).resolves.toEqual({});
      expect(consumer.close).not.toHaveBeenCalled();
      expect(peer.consumers.has('c1')).toBe(false);
    });

    it('acknowledges closeConsumer with no error when consumer id is unknown', async () => {
      const consumer = { id: 'c1', closed: false, close: jest.fn() };
      const peer = {
        id: 'socket-1',
        user: alice,
        producers: new Map(),
        consumers: new Map([['c1', consumer]]),
      };
      const room = createRoom(new Map([['socket-1', peer]]));
      voiceRoomsStateService.getRoom.mockReturnValue(room);
      const socket = createSocket({
        data: {
          user: alice,
          sessionKey: 'room:1',
          roomId: 1,
        },
      });
      socket.rooms.add('room:1');

      await expect(
        gateway.closeConsumer(socket as never, { consumerId: 'unknown-id' }),
      ).resolves.toEqual({});
      expect(consumer.close).not.toHaveBeenCalled();
      expect(peer.consumers.has('c1')).toBe(true);
      expect(peer.consumers.size).toBe(1);
    });
  });

  describe('setConsumerLayers', () => {
    const socketFor = () => {
      const socket = createSocket({
        data: { user: alice, sessionKey: 'room:1', roomId: 1 },
      });
      socket.rooms.add('room:1');
      return socket;
    };

    it('sets preferred layers for a simulcast consumer owned by the peer', async () => {
      const setPreferredLayers = jest.fn().mockResolvedValue(undefined);
      const consumer = { id: 'c1', type: 'simulcast', setPreferredLayers };
      const peer = {
        id: 'socket-1',
        user: alice,
        producers: new Map(),
        consumers: new Map([['c1', consumer]]),
      };
      voiceRoomsStateService.getRoom.mockReturnValue(
        createRoom(new Map([['socket-1', peer]])),
      );

      await expect(
        gateway.setConsumerLayers(socketFor() as never, {
          consumerId: 'c1',
          spatialLayer: 1,
        }),
      ).resolves.toEqual({});
      expect(setPreferredLayers).toHaveBeenCalledWith({ spatialLayer: 1 });
    });

    it('ignores an unknown consumer, a simple consumer, and another peer', async () => {
      const setPreferredLayers = jest.fn();
      const consumer = { id: 'c1', type: 'simple', setPreferredLayers };
      const peer = {
        id: 'socket-1',
        user: alice,
        producers: new Map(),
        consumers: new Map([['c1', consumer]]),
      };
      voiceRoomsStateService.getRoom.mockReturnValue(
        createRoom(new Map([['socket-1', peer]])),
      );
      const socket = socketFor();

      await expect(
        gateway.setConsumerLayers(socket as never, {
          consumerId: 'missing',
          spatialLayer: 0,
        }),
      ).resolves.toEqual({});
      await expect(
        gateway.setConsumerLayers(socket as never, {
          consumerId: 'c1',
          spatialLayer: 0,
        }),
      ).resolves.toEqual({});
      expect(setPreferredLayers).not.toHaveBeenCalled();
    });
  });

  describe('pauseConsumer and resumeConsumer', () => {
    const socketFor = () => {
      const socket = createSocket({
        data: { user: alice, sessionKey: 'room:1', roomId: 1 },
      });
      socket.rooms.add('room:1');
      return socket;
    };

    it('pauses and resumes the calling peer consumer and requests a keyframe for video', async () => {
      const pause = jest.fn().mockResolvedValue(undefined);
      const resume = jest.fn().mockResolvedValue(undefined);
      const requestKeyFrame = jest.fn().mockResolvedValue(undefined);
      const video = { id: 'c1', kind: 'video', pause, resume, requestKeyFrame };
      const audio = {
        id: 'c2',
        kind: 'audio',
        pause,
        resume,
        requestKeyFrame,
      };
      const peer = {
        id: 'socket-1',
        user: alice,
        producers: new Map(),
        consumers: new Map<string, unknown>([
          ['c1', video],
          ['c2', audio],
        ]),
      };
      voiceRoomsStateService.getRoom.mockReturnValue(
        createRoom(new Map([['socket-1', peer]])),
      );
      const socket = socketFor();

      await expect(
        gateway.pauseConsumer(socket as never, { consumerId: 'c1' }),
      ).resolves.toEqual({});
      expect(pause).toHaveBeenCalledTimes(1);

      await expect(
        gateway.resumeConsumer(socket as never, { consumerId: 'c1' }),
      ).resolves.toEqual({});
      expect(resume).toHaveBeenCalledTimes(1);
      expect(requestKeyFrame).toHaveBeenCalledTimes(1);

      await gateway.resumeConsumer(socket as never, { consumerId: 'c2' });
      expect(requestKeyFrame).toHaveBeenCalledTimes(1);
    });

    it('ignores an unknown consumer and another peer', async () => {
      const pause = jest.fn();
      const peer = {
        id: 'socket-1',
        user: alice,
        producers: new Map(),
        consumers: new Map(),
      };
      const other = {
        id: 'socket-2',
        user: alice,
        producers: new Map(),
        consumers: new Map([['c-other', { pause }]]),
      };
      voiceRoomsStateService.getRoom.mockReturnValue(
        createRoom(
          new Map<string, unknown>([
            ['socket-1', peer],
            ['socket-2', other],
          ]),
        ),
      );

      await expect(
        gateway.pauseConsumer(socketFor() as never, { consumerId: 'c-other' }),
      ).resolves.toEqual({});
      await expect(
        gateway.resumeConsumer(socketFor() as never, { consumerId: 'missing' }),
      ).resolves.toEqual({});
      expect(pause).not.toHaveBeenCalled();
    });
  });

  describe('SET_MUTE_STATE', () => {
    it('updates peer mute state and broadcasts to session and entity sync', async () => {
      const room = createRoom();
      const peer = {
        id: 'socket-1',
        user: alice,
        producers: new Map(),
        consumers: new Map(),
        muted: false,
        deafened: false,
      };
      room.peers.set('socket-1', peer);
      voiceRoomsStateService.getRoom.mockReturnValue(room);

      const socket = createSocket({
        data: {
          sessionKey: 'room:1',
          roomId: 1,
          user: alice,
        },
      });
      socket.rooms.add('room:1');
      const roomBroadcastEmit = jest.fn();
      (socket.to as jest.Mock).mockReturnValue({ emit: roomBroadcastEmit });

      const result = await gateway.handleSetMuteState(socket as never, {
        muted: true,
        deafened: true,
      });

      expect(result).toEqual({});
      expect(peer.muted).toBe(true);
      expect(peer.deafened).toBe(true);
      expect(roomBroadcastEmit).toHaveBeenCalledWith(
        EVoiceRoomEvent.PEER_MUTE_CHANGED,
        {
          userId: alice.id,
          muted: true,
          deafened: true,
          sessionKey: 'room:1',
          roomId: 1,
        },
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        VoiceRoomsDomainEvents.VOICE_ROOM_PEER_MUTED,
        {
          roomId: 1,
          userId: alice.id,
          muted: true,
          deafened: true,
          epoch: 'epoch-1',
          revision: 1,
        },
      );
    });

    it('does not emit entity sync when room is a direct call', async () => {
      const room = createRoom();
      const peer = {
        id: 'socket-1',
        user: alice,
        producers: new Map(),
        consumers: new Map(),
        muted: false,
        deafened: false,
      };
      room.peers.set('socket-1', peer);
      voiceRoomsStateService.getRoom.mockReturnValue(room);

      const socket = createSocket({
        data: {
          sessionKey: 'call:c1',
          user: alice,
        },
      });
      socket.rooms.add('call:c1');
      const roomBroadcastEmit = jest.fn();
      (socket.to as jest.Mock).mockReturnValue({ emit: roomBroadcastEmit });

      const result = await gateway.handleSetMuteState(socket as never, {
        muted: true,
        deafened: false,
      });

      expect(result).toEqual({});
      expect(peer.muted).toBe(true);
      expect(peer.deafened).toBe(false);
      expect(roomBroadcastEmit).toHaveBeenCalledWith(
        EVoiceRoomEvent.PEER_MUTE_CHANGED,
        {
          userId: alice.id,
          muted: true,
          deafened: false,
          sessionKey: 'call:c1',
          roomId: undefined,
        },
      );
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('returns empty object and does not broadcast when mute state is unchanged', async () => {
      const room = createRoom();
      const peer = {
        id: 'socket-1',
        user: alice,
        producers: new Map(),
        consumers: new Map(),
        muted: true,
        deafened: false,
      };
      room.peers.set('socket-1', peer);
      voiceRoomsStateService.getRoom.mockReturnValue(room);

      const socket = createSocket({
        data: {
          sessionKey: 'room:1',
          roomId: 1,
          user: alice,
        },
      });
      socket.rooms.add('room:1');
      const roomBroadcastEmit = jest.fn();
      (socket.to as jest.Mock).mockReturnValue({ emit: roomBroadcastEmit });

      const result = await gateway.handleSetMuteState(socket as never, {
        muted: true,
        deafened: false,
      });

      expect(result).toEqual({});
      expect(roomBroadcastEmit).not.toHaveBeenCalled();
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });
  });

  describe('consume', () => {
    it('rejects with AppException when receive transport is missing', async () => {
      const peer = {
        id: 'socket-1',
        user: alice,
        producers: new Map(),
        consumers: new Map(),
        recvTransport: undefined,
      };
      const room = createRoom(new Map([['socket-1', peer]]));
      voiceRoomsStateService.getRoom.mockReturnValue(room);
      const socket = createSocket({
        data: {
          user: alice,
          sessionKey: 'room:1',
          roomId: 1,
        },
      });
      socket.rooms.add('room:1');

      await expect(
        gateway.consume(socket as never, {
          transportId: 't',
          producerId: 'p1',
          rtpCapabilities: {} as never,
        }),
      ).rejects.toThrow(AppException);
    });

    it('rejects with AppException when producer is missing', async () => {
      const peer = {
        id: 'socket-1',
        user: alice,
        producers: new Map(),
        consumers: new Map(),
        recvTransport: { consume: jest.fn() },
      };
      const room = createRoom(new Map([['socket-1', peer]]));
      voiceRoomsStateService.getRoom.mockReturnValue(room);
      const socket = createSocket({
        data: {
          user: alice,
          sessionKey: 'room:1',
          roomId: 1,
        },
      });
      socket.rooms.add('room:1');

      await expect(
        gateway.consume(socket as never, {
          transportId: 't',
          producerId: 'p1',
          rtpCapabilities: {} as never,
        }),
      ).rejects.toThrow(AppException);
    });

    it('rejects with AppException when router cannot consume', async () => {
      const producer = {
        id: 'p1',
        kind: 'audio',
        appData: { mediaTag: 'mic' },
      };
      const peer = {
        id: 'socket-1',
        user: alice,
        producers: new Map(),
        consumers: new Map(),
        recvTransport: { consume: jest.fn() },
      };
      const room = {
        ...createRoom(new Map([['socket-1', peer]])),
        router: {
          canConsume: jest.fn().mockReturnValue(false),
        },
      };
      room.producers.set('p1', producer as never);
      voiceRoomsStateService.getRoom.mockReturnValue(room);
      const socket = createSocket({
        data: {
          user: alice,
          sessionKey: 'room:1',
          roomId: 1,
        },
      });
      socket.rooms.add('room:1');

      await expect(
        gateway.consume(socket as never, {
          transportId: 't',
          producerId: 'p1',
          rtpCapabilities: {} as never,
        }),
      ).rejects.toThrow(AppException);
    });

    it('creates consumer and stores in peer when valid', async () => {
      const producer = {
        id: 'p1',
        kind: 'audio',
        appData: { mediaTag: 'mic' },
      };
      const consumer = {
        id: 'c1',
        kind: 'audio',
        appData: { mediaTag: 'mic' },
        rtpParameters: {},
        observer: { on: jest.fn() },
        on: jest.fn(),
      };
      const recvTransport = {
        consume: jest.fn().mockResolvedValue(consumer),
      };
      const peer = {
        id: 'socket-1',
        user: alice,
        producers: new Map(),
        consumers: new Map(),
        recvTransport,
      };
      const room = {
        ...createRoom(new Map([['socket-1', peer]])),
        router: {
          canConsume: jest.fn().mockReturnValue(true),
        },
      };
      room.producers.set('p1', producer as never);
      voiceRoomsStateService.getRoom.mockReturnValue(room);
      const socket = createSocket({
        data: {
          user: alice,
          sessionKey: 'room:1',
          roomId: 1,
        },
      });
      socket.rooms.add('room:1');

      const result = await gateway.consume(socket as never, {
        transportId: 't',
        producerId: 'p1',
        rtpCapabilities: {} as never,
      });

      expect(result).toEqual({
        id: 'c1',
        producerId: 'p1',
        kind: 'audio',
        mediaTag: 'mic',
        rtpParameters: {},
      });
      expect(recvTransport.consume).toHaveBeenCalledWith(
        expect.not.objectContaining({ paused: true }),
      );
      producer.kind = 'video';
      producer.appData = {
        mediaTag: 'cam',
        layers: [
          { height: 720, fps: 30 },
          { height: 1080, fps: 30 },
        ],
      };
      room.producers.set('p1', producer as never);
      recvTransport.consume.mockImplementation(
        async (options: { appData: { mediaTag: string } }) => {
          consumer.appData = options.appData;
          consumer.kind = 'video';
          return consumer;
        },
      );
      const videoResult = await gateway.consume(socket as never, {
        transportId: 't',
        producerId: 'p1',
        rtpCapabilities: {} as never,
      });
      expect(recvTransport.consume).toHaveBeenLastCalledWith(
        expect.objectContaining({ paused: true }),
      );
      expect(videoResult).toEqual(
        expect.objectContaining({
          layers: [
            { height: 720, fps: 30 },
            { height: 1080, fps: 30 },
          ],
          mediaTag: 'cam',
        }),
      );
      expect(peer.consumers.get('c1')).toBe(consumer);
    });
  });

  describe('session validation', () => {
    it('rejects with AppException when socket has no session key', async () => {
      const socket = createSocket({ data: { user: alice } });
      await expect(
        gateway.handleGetRtpCapabilities(socket as never),
      ).rejects.toThrow(AppException);
    });

    it('rejects with AppException when socket is not in the session room', async () => {
      const socket = createSocket({
        data: { user: alice, sessionKey: 'room:1', roomId: 1 },
      });
      await expect(
        gateway.handleGetRtpCapabilities(socket as never),
      ).rejects.toThrow(AppException);
    });

    it('rejects with AppException when room is not found in state service', async () => {
      const socket = createSocket({
        data: { user: alice, sessionKey: 'room:1', roomId: 1 },
      });
      socket.rooms.add('room:1');
      voiceRoomsStateService.getRoom.mockReturnValue(undefined);

      await expect(
        gateway.handleGetRtpCapabilities(socket as never),
      ).rejects.toThrow(AppException);
    });

    it('rejects with AppException when socket peer is not registered in the room', async () => {
      const room = createRoom(new Map());
      voiceRoomsStateService.getRoom.mockReturnValue(room);
      const socket = createSocket({
        data: { user: alice, sessionKey: 'room:1', roomId: 1 },
      });
      socket.rooms.add('room:1');

      await expect(
        gateway.handleGetRtpCapabilities(socket as never),
      ).rejects.toThrow(AppException);
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
        VoiceRoomsDomainEvents.DIRECT_CALL_INCOMING,
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
      const elsewhereEmit = jest.fn();
      jest
        .spyOn(socket, 'to')
        .mockReturnValue({ emit: elsewhereEmit } as never);

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
      expect(socket.to).toHaveBeenCalledWith('8');
      expect(elsewhereEmit).toHaveBeenCalledWith(
        EDirectCallEvent.CALL_ANSWERED_ELSEWHERE,
        { callId: 'c1', outcome: 'accepted' },
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        VoiceRoomsDomainEvents.DIRECT_CALL_ENDED,
        { callId: 'c1', callerId: alice.id, recipientId: bob.id },
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
      directCallsStateService.reject.mockReturnValue({
        callId: 'c1',
        status: 'ringing',
        callerId: alice.id,
        recipientId: bob.id,
      });
      const socket = createSocket({ data: { user: bob } });
      const elsewhereEmit = jest.fn();
      jest
        .spyOn(socket, 'to')
        .mockReturnValue({ emit: elsewhereEmit } as never);

      gateway.handleCallReject(socket as never, {
        callId: 'c1',
        callerId: alice.id,
        reason: 'busy',
      });

      expect(directCallsStateService.reject).toHaveBeenCalledWith('c1', bob.id);
      expect(serverMock.to).toHaveBeenCalledWith('7');
      expect(serverMock.emit).toHaveBeenCalledWith(
        EDirectCallEvent.CALL_REJECTED,
        { callId: 'c1', reason: 'busy' },
      );
      expect(socket.to).toHaveBeenCalledWith('8');
      expect(elsewhereEmit).toHaveBeenCalledWith(
        EDirectCallEvent.CALL_ANSWERED_ELSEWHERE,
        { callId: 'c1', outcome: 'rejected' },
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        VoiceRoomsDomainEvents.DIRECT_CALL_ENDED,
        { callId: 'c1', callerId: alice.id, recipientId: bob.id },
      );
    });

    it('leaves the call untouched when reject returns undefined (active call or non-recipient)', () => {
      directCallsStateService.reject.mockReturnValue(undefined);

      gateway.handleCallReject(
        createSocket({ data: { user: alice } }) as never,
        {
          callId: 'c1',
          callerId: alice.id,
          reason: 'declined',
        },
      );

      expect(directCallsStateService.reject).toHaveBeenCalledWith(
        'c1',
        alice.id,
      );
      expect(serverMock.to).not.toHaveBeenCalled();
      expect(serverMock.emit).not.toHaveBeenCalled();
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
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        VoiceRoomsDomainEvents.DIRECT_CALL_ENDED,
        { callId: 'c1', callerId: alice.id, recipientId: bob.id },
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
      expect(
        gateway.handleCallGetActive(createSocket() as never, undefined),
      ).toEqual({
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

  describe('direct call ring timer and disconnect', () => {
    let realState: DirectCallsStateService;

    beforeEach(() => {
      jest.useFakeTimers();
      realState = new DirectCallsStateService();
      const roomsFacadeMock = {
        assertCanAccessRoom: jest.fn().mockResolvedValue(undefined),
      };
      gateway = new VoiceRoomsGateway(
        authService as unknown as AuthService,
        {} as never,
        roomsFacadeMock as never,
        voiceRoomsStateService as unknown as VoiceRoomsStateService,
        realState,
        eventEmitter as never,
      );
      fetchSockets = jest.fn().mockResolvedValue([]);
      serverMock = {
        to: jest.fn().mockReturnThis(),
        emit: jest.fn(),
        in: jest.fn().mockReturnValue({ fetchSockets }),
        sockets: { sockets: new Map() },
      };
      Object.assign(gateway, { server: serverMock as unknown as Server });
    });

    afterEach(() => {
      gateway.onModuleDestroy();
      jest.useRealTimers();
    });

    it('ends a ringing call after the server timeout', () => {
      const result = gateway.handleCallInitiate(createSocket() as never, {
        recipientId: bob.id,
      }) as { callId: string };

      jest.advanceTimersByTime(DIRECT_CALL_RING_TIMEOUT_MS);

      expect(realState.get(result.callId)).toBeUndefined();
      expect(serverMock.emit).toHaveBeenCalledWith(
        EDirectCallEvent.CALL_ENDED,
        expect.objectContaining({ callId: result.callId, reason: 'timeout' }),
      );
    });

    it('does not emit CALL_ENDED after accept before the timeout', () => {
      const call = realState.create(alice.id, bob.id);
      gateway['startRingTimer'](call.callId);

      gateway.handleCallAccept(createSocket({ data: { user: bob } }) as never, {
        callId: call.callId,
        callerId: alice.id,
      });

      jest.advanceTimersByTime(DIRECT_CALL_RING_TIMEOUT_MS);
      expect(serverMock.emit).not.toHaveBeenCalledWith(
        EDirectCallEvent.CALL_ENDED,
        expect.anything(),
      );
    });

    it('does not restart the ring timer for an existing ringing call', () => {
      const call = realState.create(alice.id, bob.id);
      gateway.handleCallInitiate(createSocket() as never, {
        recipientId: bob.id,
      });
      const firstTimer = gateway['ringTimers'].get(call.callId);

      gateway.handleCallInitiate(createSocket() as never, {
        recipientId: bob.id,
      });

      expect(gateway['ringTimers'].get(call.callId)).toBe(firstTimer);
    });

    it('cancels ringing calls after the caller reconnect grace elapses', async () => {
      const call = realState.create(alice.id, bob.id);
      fetchSockets.mockResolvedValue([]);

      await gateway.handleDisconnect(createSocket({ data: { user: alice } }));

      expect(realState.get(call.callId)).toBeDefined();
      expect(serverMock.emit).not.toHaveBeenCalledWith(
        EDirectCallEvent.CALL_HANGUP,
        expect.anything(),
      );

      jest.advanceTimersByTime(5_000);
      await Promise.resolve();

      expect(realState.get(call.callId)).toBeUndefined();
      expect(serverMock.to).toHaveBeenCalledWith('8');
      expect(serverMock.emit).toHaveBeenCalledWith(
        EDirectCallEvent.CALL_HANGUP,
        {
          callId: call.callId,
          byUserId: alice.id,
        },
      );
    });

    it('keeps ringing when the caller reconnects within the grace window', async () => {
      const call = realState.create(alice.id, bob.id);
      fetchSockets.mockResolvedValue([]);

      await gateway.handleDisconnect(createSocket({ data: { user: alice } }));

      authService.getUserFromRawCookies.mockResolvedValue(alice);
      await gateway.handleConnection(createSocket({ data: {} }) as never);

      jest.advanceTimersByTime(5_000);
      await Promise.resolve();

      expect(realState.get(call.callId)).toBeDefined();
      expect(serverMock.emit).not.toHaveBeenCalledWith(
        EDirectCallEvent.CALL_HANGUP,
        expect.anything(),
      );
    });

    it('keeps ringing when the caller still has another socket', async () => {
      const call = realState.create(alice.id, bob.id);
      fetchSockets.mockResolvedValue([{ id: 'other' }]);

      await gateway.handleDisconnect(createSocket({ data: { user: alice } }));

      expect(realState.get(call.callId)).toBeDefined();
      expect(serverMock.emit).not.toHaveBeenCalledWith(
        EDirectCallEvent.CALL_HANGUP,
        expect.anything(),
      );
    });

    it('keeps ringing when the callee disconnects', async () => {
      const call = realState.create(alice.id, bob.id);
      fetchSockets.mockResolvedValue([]);

      await gateway.handleDisconnect(createSocket({ data: { user: bob } }));

      expect(realState.get(call.callId)).toBeDefined();
    });
  });

  describe('handleRoomDeletedEvent', () => {
    it('leaves every connected peer and removes the voice room', () => {
      const roomId = 12;
      const sessionKey = 'room:12';
      const peer = {
        id: 'socket-1',
        user: bob,
        producers: new Map(),
        consumers: new Map(),
        sendTransport: { close: jest.fn() },
        recvTransport: { close: jest.fn() },
      };
      const room = createRoom(new Map([['socket-1', peer]]));
      voiceRoomsStateService.getRoom.mockImplementation((key: string) =>
        key === sessionKey ? room : undefined,
      );

      const socket = createSocket({
        id: 'socket-1',
        data: {
          user: bob,
          sessionKey,
          roomId,
          sessionTarget: { type: EVoiceSessionType.GROUP_ROOM, roomId },
        },
      });
      serverMock.sockets.sockets.set('socket-1', socket);

      gateway.handleRoomDeletedEvent({ id: roomId });

      expect(socket.emit).toHaveBeenCalledWith(EVoiceRoomEvent.ROOM_CLOSED, {
        roomId,
        sessionKey,
        reason: 'deleted',
      });
      expect(room.peers.has('socket-1')).toBe(false);
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        VoiceRoomsDomainEvents.VOICE_ROOM_PEER_LEFT,
        { roomId, userId: bob.id, epoch: 'epoch-1', revision: 1 },
      );
      expect(voiceRoomsStateService.removeRoom).toHaveBeenCalledWith(
        sessionKey,
      );
    });
  });

  describe('onUserSessionsRevoked', () => {
    it('should disconnect matching user sockets and keep other sockets connected', async () => {
      const targetSocket = {
        data: { user: alice },
        disconnect: jest.fn(),
      };
      const otherSocket = {
        data: { user: bob },
        disconnect: jest.fn(),
      };
      fetchSockets.mockResolvedValueOnce([targetSocket, otherSocket]);

      await gateway.onUserSessionsRevoked({ id: alice.id });

      expect(targetSocket.disconnect).toHaveBeenCalledWith(true);
      expect(otherSocket.disconnect).not.toHaveBeenCalled();
    });
  });
});
