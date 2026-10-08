import { TestBed } from '@angular/core/testing';
import { ERoomType, IRoom } from '@konvoez/shared';
import { provideTranslateService } from '@ngx-translate/core';
import { TuiNotificationService } from '@taiga-ui/core';
import { of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RoomsApiService } from './rooms-api.service';
import { RoomsStore } from '@core/stores/rooms.store';

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

  it('should initialize with empty entities and no selection', () => {
    expect(store.entities()).toEqual([]);
    expect(store.selectedRoomId()).toBeNull();
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

  it('should remove a room via API and clear selection when selected', () => {
    store.upsertOne(textRoom);
    store.setSelectedRoomId(textRoom.id);

    store.remove(textRoom.id);

    expect(apiService.remove).toHaveBeenCalledWith(textRoom.id);
    expect(store.entityMap()[textRoom.id]).toBeUndefined();
    expect(store.selectedRoomId()).toBeNull();
  });

  it('should remove one entity without clearing unrelated selection', () => {
    store.upsertOne(textRoom);
    store.upsertOne(voiceRoom);
    store.setSelectedRoomId(voiceRoom.id);

    store.removeOne(textRoom.id);

    expect(store.entityMap()[textRoom.id]).toBeUndefined();
    expect(store.selectedRoomId()).toBe(voiceRoom.id);
  });

  it('should set selected room id', () => {
    store.setSelectedRoomId(textRoom.id);
    expect(store.selectedRoomId()).toBe(textRoom.id);
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
});
