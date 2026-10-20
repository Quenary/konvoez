import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  provideRouter,
  Router,
  RouterStateSnapshot,
  UrlTree,
} from '@angular/router';
import { MockStore, provideMockStore } from '@ngrx/store/testing';
import { selectAuth } from '@core/auth/auth.selectors';
import { adminGuard } from './admin.guard';
import { firstValueFrom, Observable } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EPermission, IUser } from '@konvoez/shared';

describe('adminGuard', () => {
  let store: MockStore;
  let router: Router;

  const executeGuard = () => {
    return TestBed.runInInjectionContext(() =>
      adminGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
    ) as Observable<boolean | UrlTree>;
  };

  const createMockUser = (overrides: Partial<IUser> = {}): IUser => ({
    id: 1,
    username: 'testuser',
    fullname: 'Test User',
    email: 'test@example.com',
    isOwner: false,
    roles: [],
    permissions: [],
    avatar: null,
    avatarUrl: null,
    createdAt: new Date(),
    updatedAt: null,
    ...overrides,
  });

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideMockStore({
          selectors: [
            {
              selector: selectAuth,
              value: { init: false, user: null, loading: false },
            },
          ],
        }),
      ],
    });

    store = TestBed.inject(MockStore);
    router = TestBed.inject(Router);
  });

  afterEach(() => {
    store.resetSelectors();
    TestBed.resetTestingModule();
  });

  it('should allow access when user has MANAGE_SETTINGS permission', async () => {
    store.overrideSelector(selectAuth, {
      init: true,
      user: createMockUser({ permissions: [EPermission.MANAGE_SETTINGS] }),
      loading: false,
    });
    store.refreshState();

    const result = await firstValueFrom(executeGuard());
    expect(result).toBe(true);
  });

  it('should allow access when user is OWNER', async () => {
    store.overrideSelector(selectAuth, {
      init: true,
      user: createMockUser({ isOwner: true }),
      loading: false,
    });
    store.refreshState();

    const result = await firstValueFrom(executeGuard());
    expect(result).toBe(true);
  });

  it('should redirect to / when user lacks permission', async () => {
    store.overrideSelector(selectAuth, {
      init: true,
      user: createMockUser({ permissions: [] }),
      loading: false,
    });
    store.refreshState();

    const result = await firstValueFrom(executeGuard());
    expect(result).toEqual(router.createUrlTree(['/']));
  });

  it('should redirect to / when user is null', async () => {
    store.overrideSelector(selectAuth, {
      init: true,
      user: null,
      loading: false,
    });
    store.refreshState();

    const result = await firstValueFrom(executeGuard());
    expect(result).toEqual(router.createUrlTree(['/']));
  });

  it('should wait until init is true before emitting', () => {
    let emitted = false;

    executeGuard().subscribe(() => {
      emitted = true;
    });

    expect(emitted).toBe(false);

    store.overrideSelector(selectAuth, {
      init: true,
      user: createMockUser({ isOwner: true }),
      loading: false,
    });
    store.refreshState();

    expect(emitted).toBe(true);
  });
});
