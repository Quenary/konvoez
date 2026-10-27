jest.mock('mediasoup', () => ({
  createWorker: jest.fn().mockResolvedValue({
    on: jest.fn(),
    close: jest.fn(),
  }),
}));
jest.mock('mediasoup/types', () => ({}), { virtual: true });

import { EUserRole, type IUserSafe } from '@konvoez/shared';
import { AppService } from '@shared/services/app.service';
import { VoiceRoomsDomainEvents } from './voice-rooms.events';
import { createWorker } from 'mediasoup';
import { Mutex } from 'async-mutex';
import { VoiceRoomsStateService } from './voice-rooms.state';

const alice: IUserSafe = {
  id: 1,
  username: 'alice',
  fullname: 'Alice',
  avatarUrl: null,
  role: EUserRole.MEMBER,
  createdAt: new Date(),
  updatedAt: new Date(),
} as IUserSafe;

const bob: IUserSafe = {
  ...alice,
  id: 2,
  username: 'bob',
  fullname: 'Bob',
};

describe('VoiceRoomsStateService lobby revision', () => {
  let service: VoiceRoomsStateService;
  let eventEmitter: { emit: jest.Mock };

  beforeEach(() => {
    eventEmitter = { emit: jest.fn() };
    service = new VoiceRoomsStateService(
      {} as unknown as AppService,
      eventEmitter as never,
    );
  });

  it('starts the snapshot at revision 0 with an epoch and no rooms', () => {
    const snapshot = service.getLobbySnapshot();

    expect(snapshot.revision).toBe(0);
    expect(snapshot.epoch).toEqual(expect.any(String));
    expect(snapshot.rooms).toEqual({});
  });

  it('increments revision for every joined/left event within one epoch', () => {
    const { epoch } = service.getLobbySnapshot();

    const joined = service.createLobbyPeerJoined(5, alice);
    const left = service.createLobbyPeerLeft(5, alice.id);
    const muted = service.createLobbyPeerMuted(5, alice.id, true, false);

    expect(joined).toEqual({
      roomId: 5,
      user: alice,
      muted: false,
      deafened: false,
      epoch,
      revision: 1,
    });
    expect(left).toEqual({ roomId: 5, userId: alice.id, epoch, revision: 2 });
    expect(muted).toEqual({
      roomId: 5,
      userId: alice.id,
      muted: true,
      deafened: false,
      epoch,
      revision: 3,
    });
    expect(service.getLobbySnapshot().revision).toBe(3);
  });

  it('uses a different epoch for every service instance', () => {
    const other = new VoiceRoomsStateService(
      {} as unknown as AppService,
      eventEmitter as never,
    );

    expect(other.getLobbySnapshot().epoch).not.toBe(
      service.getLobbySnapshot().epoch,
    );
  });
});

const appServiceStub = {
  MEDIASOUP_ANNOUNCED_ADDRESSES: [],
} as unknown as AppService;

describe('VoiceRoomsStateService lobby eviction', () => {
  let service: VoiceRoomsStateService;
  let eventEmitter: { emit: jest.Mock };
  let createRouter: jest.Mock;

  beforeEach(async () => {
    eventEmitter = { emit: jest.fn() };
    createRouter = jest.fn().mockResolvedValue({
      closed: false,
      rtpCapabilities: {},
      close: jest.fn(),
    });
    (createWorker as jest.Mock).mockResolvedValue({
      createRouter,
      close: jest.fn(),
    });

    service = new VoiceRoomsStateService(appServiceStub, eventEmitter as never);
    await service.onModuleInit();
  });

  it('emits VOICE_ROOM_PEER_LEFT when a group room is removed with peers', async () => {
    const target = service.createGroupIdentity(9);
    const sessionKey = 'room:9';
    const router = {
      closed: false,
      close: jest.fn(function (this: { closed: boolean }) {
        this.closed = true;
      }),
    };
    service['rooms'].set(sessionKey, {
      target,
      id: sessionKey,
      router: router as never,
      peers: new Map([
        [
          's1',
          {
            id: 's1',
            user: alice,
            producers: new Map(),
            consumers: new Map(),
            muted: false,
            deafened: false,
          },
        ],
        [
          's2',
          {
            id: 's2',
            user: bob,
            producers: new Map(),
            consumers: new Map(),
            muted: false,
            deafened: false,
          },
        ],
      ]),
      producers: new Map(),
      produceMutex: new Mutex(),
    });

    await service.removeRoom(sessionKey);

    expect(eventEmitter.emit).toHaveBeenCalledTimes(2);
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      VoiceRoomsDomainEvents.VOICE_ROOM_PEER_LEFT,
      expect.objectContaining({ roomId: 9, userId: alice.id, revision: 1 }),
    );
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      VoiceRoomsDomainEvents.VOICE_ROOM_PEER_LEFT,
      expect.objectContaining({ roomId: 9, userId: bob.id, revision: 2 }),
    );
    expect(service.getRoom(sessionKey)).toBeUndefined();
  });

  it('emits peer-left once per user when recreating a room with a closed router', async () => {
    const target = service.createGroupIdentity(3);
    const sessionKey = 'room:3';
    const closedRouter = {
      closed: true,
      close: jest.fn(),
    };
    service['rooms'].set(sessionKey, {
      target,
      id: sessionKey,
      router: closedRouter as never,
      peers: new Map([
        [
          's1',
          {
            id: 's1',
            user: alice,
            producers: new Map(),
            consumers: new Map(),
            muted: false,
            deafened: false,
          },
        ],
        [
          's2',
          {
            id: 's2',
            user: alice,
            producers: new Map(),
            consumers: new Map(),
            muted: false,
            deafened: false,
          },
        ],
      ]),
      producers: new Map(),
      produceMutex: new Mutex(),
    });

    await service.ensureRoom(target);

    expect(eventEmitter.emit).toHaveBeenCalledTimes(1);
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      VoiceRoomsDomainEvents.VOICE_ROOM_PEER_LEFT,
      expect.objectContaining({ roomId: 3, userId: alice.id, revision: 1 }),
    );
    expect(service.getRoom(sessionKey)?.peers.size).toBe(0);
  });
});

describe('VoiceRoomsStateService snapshots and peers', () => {
  let service: VoiceRoomsStateService;
  let eventEmitter: { emit: jest.Mock };

  beforeEach(() => {
    eventEmitter = { emit: jest.fn() };
    service = new VoiceRoomsStateService(appServiceStub, eventEmitter as never);
  });

  it('returns muted and deafened peer state in getAllPeers and getPeersOnJoin', () => {
    const target = service.createGroupIdentity(42);
    const sessionKey = 'room:42';
    const peer = {
      id: 'socket-alice',
      user: alice,
      producers: new Map([
        [
          'prod-1',
          {
            id: 'prod-1',
            kind: 'audio',
            appData: { mediaTag: 'mic', peerId: 'socket-alice' },
          },
        ],
      ]),
      consumers: new Map(),
      muted: true,
      deafened: false,
    };

    service['rooms'].set(sessionKey, {
      target,
      id: sessionKey,
      router: {} as never,
      peers: new Map([['socket-alice', peer as never]]),
      producers: new Map(),
      produceMutex: new Mutex(),
    });

    const allPeers = service.getAllPeers();
    expect(allPeers[42]).toEqual({
      [alice.id]: {
        ...alice,
        muted: true,
        deafened: false,
      },
    });

    const peersOnJoin = service.getPeersOnJoin(sessionKey);
    expect(peersOnJoin[alice.id]).toEqual({
      ...alice,
      muted: true,
      deafened: false,
      producers: [
        {
          userId: alice.id,
          producerId: 'prod-1',
          peerId: 'prod-1',
          kind: 'audio',
          mediaTag: 'mic',
        },
      ],
    });
  });

  it('ignores non-group sessions in getAllPeers', () => {
    const directCallTarget = service.createDirectCallIdentity('call-123');
    const sessionKey = 'call:call-123';
    service['rooms'].set(sessionKey, {
      target: directCallTarget,
      id: sessionKey,
      router: {} as never,
      peers: new Map([
        [
          'socket-alice',
          {
            id: 'socket-alice',
            user: alice,
            producers: new Map(),
            consumers: new Map(),
            muted: false,
            deafened: false,
          } as never,
        ],
      ]),
      producers: new Map(),
      produceMutex: new Mutex(),
    });

    expect(service.getAllPeers()).toEqual({});
  });

  it('exits the process when the mediasoup worker dies', async () => {
    const listeners: Record<string, (error: unknown) => void> = {};
    const mockWorker = {
      on: jest.fn((event: string, callback: (error: unknown) => void) => {
        listeners[event] = callback;
      }),
      close: jest.fn(),
    };
    (createWorker as jest.Mock).mockResolvedValue(mockWorker);

    const exitSpy = jest
      .spyOn(process, 'exit')
      .mockImplementation((() => undefined) as never);

    const appService = {
      MEDIASOUP_ANNOUNCED_ADDRESSES: [],
    } as unknown as AppService;

    const stateService = new VoiceRoomsStateService(
      appService,
      eventEmitter as never,
    );
    await stateService.onModuleInit();

    expect(mockWorker.on).toHaveBeenCalledWith('died', expect.any(Function));

    const workerError = new Error('Worker segfault');
    listeners['died']?.(workerError);

    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
  });
});
