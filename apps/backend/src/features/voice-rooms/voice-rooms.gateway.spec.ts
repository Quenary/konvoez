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
  EDirectCallEvent,
  EUserRole,
  EVoiceRoomEvent,
  EVoiceRoomErrorCode,
  EVoiceSessionType,
  type IUser,
  type IVoiceRoomProduce,
} from '@konvoez/shared';
import { NotificationsDomainEvents } from '@shared/events/notifications.events';
import { EntitySyncDomainEvents } from '@shared/events/entity-sync.events';
import { WsException } from '@nestjs/websockets';
import { Mutex } from 'async-mutex';
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
  let authService: { getUserFromRawCookies: jest.Mock };
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
      createLobbyPeerJoined: jest.fn((roomId: number, user: IUser) => ({
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

    it('rejects connectTransport with WsException when transport is not found', async () => {
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
      ).rejects.toThrow(WsException);
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
        EntitySyncDomainEvents.VOICE_ROOM_PEER_JOINED,
        { roomId: 1, user: alice, epoch: 'epoch-1', revision: 1 },
      );
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
      expect(eventEmitter.emit).not.toHaveBeenCalledWith(
        EntitySyncDomainEvents.VOICE_ROOM_PEER_JOINED,
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
        EntitySyncDomainEvents.VOICE_ROOM_PEER_JOINED,
        expect.anything(),
      );
      expect(eventEmitter.emit).not.toHaveBeenCalledWith(
        EntitySyncDomainEvents.VOICE_ROOM_PEER_LEFT,
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
        EntitySyncDomainEvents.VOICE_ROOM_PEER_LEFT,
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

    it('rejects unknown mediaTag with WsException', async () => {
      const { room } = readyPeer();
      voiceRoomsStateService.getRoom.mockReturnValue(room);
      await expect(
        gateway.produce(joinedSocket() as never, {
          transportId: 't',
          kind: 'audio',
          mediaTag: 'webcam' as never,
          rtpParameters: {},
        }),
      ).rejects.toThrow(WsException);
    });

    it('rejects kind/mediaTag mismatch with WsException', async () => {
      const { room } = readyPeer();
      voiceRoomsStateService.getRoom.mockReturnValue(room);
      await expect(
        gateway.produce(joinedSocket() as never, {
          transportId: 't',
          kind: 'audio',
          mediaTag: 'cam',
          rtpParameters: {},
        }),
      ).rejects.toThrow(WsException);
    });

    it('rejects screen-audio without screen with WsException', async () => {
      const { room } = readyPeer();
      voiceRoomsStateService.getRoom.mockReturnValue(room);
      await expect(
        gateway.produce(joinedSocket() as never, {
          transportId: 't',
          kind: 'audio',
          mediaTag: 'screen-audio',
          rtpParameters: {},
        }),
      ).rejects.toThrow(WsException);
    });

    it('rejects produce with WsException when send transport is missing', async () => {
      const { room } = readyPeer({ sendTransport: undefined });
      voiceRoomsStateService.getRoom.mockReturnValue(room);
      await expect(
        gateway.produce(joinedSocket() as never, {
          transportId: 't',
          kind: 'audio',
          mediaTag: 'mic',
          rtpParameters: {},
        }),
      ).rejects.toThrow(WsException);
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
      ).rejects.toThrow(EVoiceRoomErrorCode.VIDEO_LIMIT_REACHED);
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
        const user: IUser = { ...alice, id: 10 + i, username: `user-${i}` };
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
        WsException,
      );
      expect(
        (
          (rejected[0] as PromiseRejectedResult).reason as WsException
        ).getError(),
      ).toBe(EVoiceRoomErrorCode.VIDEO_LIMIT_REACHED);
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
      const producePayload: IVoiceRoomProduce = {
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
        rtpParameters: {},
      });

      expect(result.producerId).toBe('cam-1');
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

  describe('consume', () => {
    it('rejects with WsException when receive transport is missing', async () => {
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
      ).rejects.toThrow(WsException);
    });

    it('rejects with WsException when producer is missing', async () => {
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
      ).rejects.toThrow(WsException);
    });

    it('rejects with WsException when router cannot consume', async () => {
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
      ).rejects.toThrow(WsException);
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
      expect(peer.consumers.get('c1')).toBe(consumer);
    });
  });

  describe('session validation', () => {
    it('rejects with WsException when socket has no session key', async () => {
      const socket = createSocket({ data: { user: alice } });
      await expect(
        gateway.handleGetRtpCapabilities(socket as never),
      ).rejects.toThrow(WsException);
    });

    it('rejects with WsException when socket is not in the session room', async () => {
      const socket = createSocket({
        data: { user: alice, sessionKey: 'room:1', roomId: 1 },
      });
      await expect(
        gateway.handleGetRtpCapabilities(socket as never),
      ).rejects.toThrow(WsException);
    });

    it('rejects with WsException when room is not found in state service', async () => {
      const socket = createSocket({
        data: { user: alice, sessionKey: 'room:1', roomId: 1 },
      });
      socket.rooms.add('room:1');
      voiceRoomsStateService.getRoom.mockReturnValue(undefined);

      await expect(
        gateway.handleGetRtpCapabilities(socket as never),
      ).rejects.toThrow(WsException);
    });

    it('rejects with WsException when socket peer is not registered in the room', async () => {
      const room = createRoom(new Map());
      voiceRoomsStateService.getRoom.mockReturnValue(room);
      const socket = createSocket({
        data: { user: alice, sessionKey: 'room:1', roomId: 1 },
      });
      socket.rooms.add('room:1');

      await expect(
        gateway.handleGetRtpCapabilities(socket as never),
      ).rejects.toThrow(WsException);
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
      directCallsStateService.reject.mockReturnValue({
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

      expect(directCallsStateService.reject).toHaveBeenCalledWith('c1', bob.id);
      expect(serverMock.to).toHaveBeenCalledWith('7');
      expect(serverMock.emit).toHaveBeenCalledWith(
        EDirectCallEvent.CALL_REJECTED,
        { callId: 'c1', reason: 'busy' },
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
        EntitySyncDomainEvents.VOICE_ROOM_PEER_LEFT,
        { roomId, userId: bob.id, epoch: 'epoch-1', revision: 1 },
      );
      expect(voiceRoomsStateService.removeRoom).toHaveBeenCalledWith(
        sessionKey,
      );
    });
  });
});
