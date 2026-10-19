import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MockStore, provideMockStore } from '@ngrx/store/testing';
import { EPermission, IRole } from '@konvoez/shared';
import { selectIsAuthorized } from '@core/auth/auth.selectors';
import { RolesApiService } from '@core/api/roles-api.service';
import { RolesStore } from './roles.store';

describe('RolesStore', () => {
  let store: InstanceType<typeof RolesStore>;
  let mockStore: MockStore;
  let rolesApiService: {
    findAll: ReturnType<typeof vi.fn>;
  };

  const defaultRole: IRole = {
    id: 1,
    name: 'User',
    color: null,
    priority: 0,
    isDefault: true,
    mentionable: false,
    permissions: [EPermission.SEND_MESSAGES],
    createdAt: new Date(),
    updatedAt: null,
  };

  const mentionableRole: IRole = {
    id: 2,
    name: 'Moderator',
    color: '#3b82f6',
    priority: 10,
    isDefault: false,
    mentionable: true,
    permissions: [EPermission.MODERATE_MESSAGES],
    createdAt: new Date(),
    updatedAt: null,
  };

  beforeEach(() => {
    rolesApiService = {
      findAll: vi.fn().mockReturnValue(of([defaultRole, mentionableRole])),
    };

    TestBed.configureTestingModule({
      providers: [
        RolesStore,
        provideMockStore({
          selectors: [{ selector: selectIsAuthorized, value: false }],
        }),
        { provide: RolesApiService, useValue: rolesApiService },
      ],
    });

    mockStore = TestBed.inject(MockStore);
    store = TestBed.inject(RolesStore);
  });

  afterEach(() => {
    mockStore.resetSelectors();
    TestBed.resetTestingModule();
  });

  it('loads all roles when user becomes authorized and computes rolesById and mentionableRoles', () => {
    expect(rolesApiService.findAll).not.toHaveBeenCalled();
    expect(store.entities()).toEqual([]);

    mockStore.overrideSelector(selectIsAuthorized, true);
    mockStore.refreshState();

    expect(rolesApiService.findAll).toHaveBeenCalled();
    expect(store.entities()).toHaveLength(2);
    expect(store.rolesById()).toEqual({
      1: defaultRole,
      2: mentionableRole,
    });
    expect(store.mentionableRoles()).toEqual([mentionableRole]);
  });

  it('clears roles when user logs out', () => {
    mockStore.overrideSelector(selectIsAuthorized, true);
    mockStore.refreshState();
    expect(store.entities()).toHaveLength(2);

    mockStore.overrideSelector(selectIsAuthorized, false);
    mockStore.refreshState();

    expect(store.entities()).toEqual([]);
    expect(store.mentionableRoles()).toEqual([]);
    expect(store.rolesById()).toEqual({});
  });

  it('allows manual upsert and removal of entities', () => {
    store.upsertOne(defaultRole);
    expect(store.entities()).toEqual([defaultRole]);

    store.upsertOne(mentionableRole);
    expect(store.entities()).toHaveLength(2);

    store.removeOne(defaultRole.id);
    expect(store.entities()).toEqual([mentionableRole]);

    store.clear();
    expect(store.entities()).toEqual([]);
  });
});
