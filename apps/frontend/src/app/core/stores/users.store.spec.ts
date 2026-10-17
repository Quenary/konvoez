import { TestBed } from '@angular/core/testing';
import { EUserRole, IUser } from '@konvoez/shared';
import { provideTranslateService } from '@ngx-translate/core';
import { TuiNotificationService } from '@taiga-ui/core';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UsersApiService } from '@core/api/users-api.service';
import { UsersStore } from './users.store';

describe('UsersStore', () => {
  let store: InstanceType<typeof UsersStore>;
  let apiService: {
    list: ReturnType<typeof vi.fn>;
  };
  let mockNotifications: { open: ReturnType<typeof vi.fn> };

  const userAlice: IUser = {
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

  const userBob: IUser = {
    id: 2,
    username: 'bob',
    fullname: 'Bob',
    email: 'bob@example.com',
    role: EUserRole.MEMBER,
    avatar: null,
    avatarUrl: null,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: null,
  };

  beforeEach(() => {
    apiService = {
      list: vi.fn().mockReturnValue(of([userAlice, userBob])),
    };

    mockNotifications = {
      open: vi.fn().mockReturnValue(of(null)),
    };

    TestBed.configureTestingModule({
      providers: [
        UsersStore,
        provideTranslateService(),
        { provide: UsersApiService, useValue: apiService },
        { provide: TuiNotificationService, useValue: mockNotifications },
      ],
    });

    store = TestBed.inject(UsersStore);
  });

  it('initializes with empty onlineMap and unloaded state', () => {
    expect(store.onlineMap()).toEqual({});
    expect(store.loaded()).toBe(false);
    expect(store.entities()).toEqual([]);
  });

  it('updates onlineMap when setOnlineUsers is called', () => {
    store.setOnlineUsers([1, 2]);
    expect(store.onlineMap()).toEqual({ 1: true, 2: true });

    store.setOnlineUsers([2, 3]);
    expect(store.onlineMap()).toEqual({ 2: true, 3: true });
  });

  it('updates onlineMap incrementally when setUserPresence is called', () => {
    store.setOnlineUsers([1]);
    expect(store.onlineMap()).toEqual({ 1: true });

    store.setUserPresence(2, true);
    expect(store.onlineMap()).toEqual({ 1: true, 2: true });

    store.setUserPresence(1, false);
    expect(store.onlineMap()).toEqual({ 2: true });

    store.setUserPresence(99, false);
    expect(store.onlineMap()).toEqual({ 2: true });
  });

  it('clears onlineMap and entities on clear()', () => {
    store.upsertOne(userAlice);
    store.setOnlineUsers([1, 2]);

    expect(store.entities().length).toBe(1);
    expect(Object.keys(store.onlineMap()).length).toBe(2);

    store.clear();

    expect(store.entities()).toEqual([]);
    expect(store.onlineMap()).toEqual({});
    expect(store.loaded()).toBe(false);
  });

  it('upserts and removes individual entities', () => {
    store.upsertOne(userAlice);
    expect(store.entities()).toEqual([userAlice]);

    store.upsertOne(userBob);
    expect(store.entities().length).toBe(2);

    store.removeOne(1);
    expect(store.entities()).toEqual([userBob]);
  });
});
