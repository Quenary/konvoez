import { TestBed } from '@angular/core/testing';
import { ERoomType, IRoom } from '@konvoez/shared';
import { provideTranslateService } from '@ngx-translate/core';
import { TuiNotificationService } from '@taiga-ui/core';
import { of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RoomsApiService } from '@core/api/rooms-api.service';
import { RoomsStore } from './rooms.store';

describe('RoomsStore', () => {
  let store: InstanceType<typeof RoomsStore>;
  let apiService: {
    list: ReturnType<typeof vi.fn>;
    read: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
  };
  let mockNotifications: { open: ReturnType<typeof vi.fn> };

  const textRoom: IRoom = {
    id: 10,
    name: 'general',
    type: ERoomType.TEXT,
    avatar: null,
    avatarUrl: null,
    author: { id: 1, username: 'alice', fullname: 'Alice' },
    createdAt: new Date(),
    updatedAt: null,
  };

  const voiceRoom: IRoom = {
    id: 20,
    name: 'lounge',
    type: ERoomType.VOICE,
    avatar: null,
    avatarUrl: null,
    author: { id: 1, username: 'alice', fullname: 'Alice' },
    createdAt: new Date(),
    updatedAt: null,
  };

  const betaTextRoom: IRoom = {
    ...textRoom,
    id: 11,
    name: 'beta',
  };

  beforeEach(() => {
    apiService = {
      list: vi.fn().mockReturnValue(of([betaTextRoom, textRoom, voiceRoom])),
      read: vi.fn().mockReturnValue(of(textRoom)),
      create: vi.fn().mockReturnValue(of(betaTextRoom)),
      update: vi.fn().mockReturnValue(of({ ...textRoom, name: 'renamed' })),
      remove: vi.fn().mockReturnValue(of(undefined)),
    };

    mockNotifications = {
      open: vi.fn().mockReturnValue(of(null)),
    };

    TestBed.configureTestingModule({
      providers: [
        provideTranslateService(),
        { provide: RoomsApiService, useValue: apiService },
        { provide: TuiNotificationService, useValue: mockNotifications },
        RoomsStore,
      ],
    });

    store = TestBed.inject(RoomsStore);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize with empty entities', () => {
    expect(store.entities()).toEqual([]);
  });

  it('should load all rooms sorted by name within each type list', () => {
    store.loadAll();

    expect(apiService.list).toHaveBeenCalled();
    expect(store.entities()).toHaveLength(3);
    expect(store.textRooms().map((r) => r.name)).toEqual(['beta', 'general']);
    expect(store.voiceRooms()).toEqual([voiceRoom]);
  });

  it('should load one room', () => {
    store.loadOne(textRoom.id);

    expect(apiService.read).toHaveBeenCalledWith(textRoom.id);
    expect(store.entityMap()[textRoom.id]).toEqual(textRoom);
  });

  it('should create and upsert a room', () => {
    store.create({ name: 'beta', type: ERoomType.TEXT });

    expect(apiService.create).toHaveBeenCalled();
    expect(store.entityMap()[betaTextRoom.id]).toEqual(betaTextRoom);
  });

  it('should update a room', () => {
    store.upsertOne(textRoom);
    store.update({ id: textRoom.id, room: { name: 'renamed' } });

    expect(apiService.update).toHaveBeenCalledWith(textRoom.id, {
      name: 'renamed',
    });
    expect(store.entityMap()[textRoom.id]?.name).toBe('renamed');
  });

  it('should remove a room via API', () => {
    store.upsertOne(textRoom);

    store.remove(textRoom.id);

    expect(apiService.remove).toHaveBeenCalledWith(textRoom.id);
    expect(store.entityMap()[textRoom.id]).toBeUndefined();
  });

  it('should remove one entity', () => {
    store.upsertOne(textRoom);
    store.upsertOne(voiceRoom);

    store.removeOne(textRoom.id);

    expect(store.entityMap()[textRoom.id]).toBeUndefined();
    expect(store.entityMap()[voiceRoom.id]).toBeDefined();
  });

  it('should clear all entities on clear()', () => {
    store.upsertOne(textRoom);
    store.upsertOne(voiceRoom);

    store.clear();

    expect(store.entities()).toHaveLength(0);
    expect(Object.keys(store.entityMap())).toHaveLength(0);
  });

  it('should show notification and keep entities on loadAll error', () => {
    store.upsertOne(textRoom);
    apiService.list.mockReturnValue(
      throwError(() => new Error('Server error')),
    );

    store.loadAll();

    expect(store.entities()).toHaveLength(1);
    expect(mockNotifications.open).toHaveBeenCalled();
  });

  it('handles concurrent removes and updates state for both', () => {
    store.upsertOne(textRoom);
    store.upsertOne(voiceRoom);

    store.remove(textRoom.id);
    store.remove(voiceRoom.id);

    expect(apiService.remove).toHaveBeenCalledWith(textRoom.id);
    expect(apiService.remove).toHaveBeenCalledWith(voiceRoom.id);
    expect(store.entityMap()[textRoom.id]).toBeUndefined();
    expect(store.entityMap()[voiceRoom.id]).toBeUndefined();
  });

  it('handles concurrent removes with errors and shows notifications for both', () => {
    store.upsertOne(textRoom);
    store.upsertOne(voiceRoom);

    apiService.remove.mockReturnValue(
      throwError(() => new Error('Delete failed')),
    );

    store.remove(textRoom.id);
    store.remove(voiceRoom.id);

    expect(mockNotifications.open).toHaveBeenCalledTimes(2);
  });

  it('handles concurrent creates and upserts both entities', () => {
    const anotherRoom: IRoom = { ...betaTextRoom, id: 99, name: 'other' };
    apiService.create
      .mockReturnValueOnce(of(betaTextRoom))
      .mockReturnValueOnce(of(anotherRoom));

    store.create({ name: 'beta', type: ERoomType.TEXT });
    store.create({ name: 'other', type: ERoomType.TEXT });

    expect(store.entityMap()[betaTextRoom.id]).toEqual(betaTextRoom);
    expect(store.entityMap()[anotherRoom.id]).toEqual(anotherRoom);
  });
});
