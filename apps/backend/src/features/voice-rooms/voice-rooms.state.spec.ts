jest.mock('mediasoup', () => ({
  createWorker: jest.fn(),
}));
jest.mock('mediasoup/types', () => ({}), { virtual: true });

import { EUserRole, type IUser } from '@konvoez/shared';
import { AppService } from '@shared/services/app.service';
import { EntitySyncDomainEvents } from '@shared/events/entity-sync.events';
import { createWorker } from 'mediasoup';
import { VoiceRoomsStateService } from './voice-rooms.state';

const alice: IUser = {
  id: 1,
  username: 'alice',
  fullname: 'Alice',
  email: 'alice@example.com',
  avatarUrl: null,
  role: EUserRole.MEMBER,
  createdAt: new Date(),
  updatedAt: new Date(),
} as IUser;

const bob: IUser = {
  ...alice,
  id: 2,
  username: 'bob',
  fullname: 'Bob',
  email: 'bob@example.com',
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

    expect(joined).toEqual({ roomId: 5, user: alice, epoch, revision: 1 });
    expect(left).toEqual({ roomId: 5, userId: alice.id, epoch, revision: 2 });
    expect(service.getLobbySnapshot().revision).toBe(2);
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
          },
        ],
        [
          's2',
          {
            id: 's2',
            user: bob,
            producers: new Map(),
            consumers: new Map(),
          },
        ],
      ]),
      producers: new Map(),
    });

    await service.removeRoom(sessionKey);

    expect(eventEmitter.emit).toHaveBeenCalledTimes(2);
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      EntitySyncDomainEvents.VOICE_ROOM_PEER_LEFT,
      expect.objectContaining({ roomId: 9, userId: alice.id, revision: 1 }),
    );
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      EntitySyncDomainEvents.VOICE_ROOM_PEER_LEFT,
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
          },
        ],
        [
          's2',
          {
            id: 's2',
            user: alice,
            producers: new Map(),
            consumers: new Map(),
          },
        ],
      ]),
      producers: new Map(),
    });

    await service.ensureRoom(target);

    expect(eventEmitter.emit).toHaveBeenCalledTimes(1);
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      EntitySyncDomainEvents.VOICE_ROOM_PEER_LEFT,
      expect.objectContaining({ roomId: 3, userId: alice.id, revision: 1 }),
    );
    expect(service.getRoom(sessionKey)?.peers.size).toBe(0);
  });
});
