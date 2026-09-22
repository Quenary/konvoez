import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { provideStore } from '@ngrx/store';
import { provideTranslateService } from '@ngx-translate/core';
import { TuiNotificationService } from '@taiga-ui/core';
import { TextRoomApiService } from '../text-room/text-room-api.service';
import { DirectChatsStore } from './direct-chats.store';
import { TextRoomSocketToken } from '@core/tokens/text-room-socket.token';
import { EUserRole, IUser } from '@konvoez/shared';

describe('DirectChatsStore', () => {
  let store: InstanceType<typeof DirectChatsStore>;
  let apiService: {
    direct: ReturnType<typeof vi.fn>;
  };
  let mockSocket: {
    on: ReturnType<typeof vi.fn>;
    off: ReturnType<typeof vi.fn>;
    emit: ReturnType<typeof vi.fn>;
  };
  let mockNotifications: { open: ReturnType<typeof vi.fn> };

  const mockUsers: IUser[] = [
    {
      id: 2,
      username: 'alice',
      fullname: 'Alice Smith',
      email: 'alice@example.com',
      role: EUserRole.MEMBER,
      avatarUrl: null,
      createdAt: new Date(),
      updatedAt: null,
    },
    {
      id: 3,
      username: 'bob',
      fullname: 'Bob Jones',
      email: 'bob@example.com',
      role: EUserRole.MEMBER,
      avatarUrl: null,
      createdAt: new Date(),
      updatedAt: null,
    },
  ];

  beforeEach(() => {
    apiService = {
      direct: vi.fn().mockReturnValue(of(mockUsers)),
    };

    mockSocket = {
      on: vi.fn(),
      off: vi.fn(),
      emit: vi.fn(),
    };

    mockNotifications = {
      open: vi.fn().mockReturnValue(of(null)),
    };

    TestBed.configureTestingModule({
      providers: [
        provideStore({
          auth: () => ({ user: { id: 1, username: 'me' } }),
        }),
        provideTranslateService(),
        { provide: TextRoomApiService, useValue: apiService },
        { provide: TextRoomSocketToken, useValue: mockSocket },
        { provide: TuiNotificationService, useValue: mockNotifications },
        DirectChatsStore,
      ],
    });

    store = TestBed.inject(DirectChatsStore);
  });

  it('should initialize with empty state', () => {
    expect(store.entities()).toEqual([]);
    expect(store.loading()).toBe(false);
    expect(store.loaded()).toBe(false);
  });

  it('should load direct chats from api', () => {
    store.loadDirectChats();

    expect(apiService.direct).toHaveBeenCalled();
    expect(store.entities()).toHaveLength(2);
    expect(store.loaded()).toBe(true);
    expect(store.loading()).toBe(false);
  });

  it('should handle error on loadDirectChats', () => {
    apiService.direct.mockReturnValue(
      throwError(() => new Error('Server error')),
    );

    store.loadDirectChats();

    expect(store.loading()).toBe(false);
    expect(mockNotifications.open).toHaveBeenCalled();
  });

  it('should add or update a chat', () => {
    const newUser: IUser = {
      id: 99,
      username: 'charlie',
      fullname: 'Charlie Brown',
      email: 'charlie@example.com',
      role: EUserRole.MEMBER,
      avatarUrl: null,
      createdAt: new Date(),
      updatedAt: null,
    };

    store.addOrUpdateChat(newUser);

    expect(store.entityMap()[99]).toEqual(newUser);
  });

  it('should clear store on clear()', () => {
    store.loadDirectChats();
    expect(store.entities()).toHaveLength(2);

    store.clear();

    expect(store.entities()).toEqual([]);
    expect(store.loaded()).toBe(false);
    expect(store.loading()).toBe(false);
  });
});
