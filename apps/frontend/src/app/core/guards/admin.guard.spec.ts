import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  provideRouter,
  Router,
  RouterStateSnapshot,
  UrlTree,
} from '@angular/router';
import { MockStore, provideMockStore } from '@ngrx/store/testing';
import { selectAuth } from '@features/auth/auth.selectors';
import { adminGuard } from './admin.guard';
import { firstValueFrom, Observable } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';
import { EUserRole, IUser } from '@konvoez/shared';

describe('adminGuard', () => {
  let store: MockStore;
  let router: Router;

  const executeGuard = () => {
    return TestBed.runInInjectionContext(() =>
      adminGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
    ) as Observable<boolean | UrlTree>;
  };

  const createMockUser = (role: EUserRole): IUser => ({
    id: 1,
    username: 'testuser',
    fullname: 'Test User',
    email: 'test@example.com',
    role,
    avatar: null,
    createdAt: new Date(),
    updatedAt: null,
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

  it('should allow access (return true) when user is ADMIN', async () => {
    store.overrideSelector(selectAuth, {
      init: true,
      user: createMockUser(EUserRole.ADMIN),
      loading: false,
    });
    store.refreshState();

    const result = await firstValueFrom(executeGuard());
    expect(result).toBe(true);
  });

  it('should allow access (return true) when user is OWNER', async () => {
    store.overrideSelector(selectAuth, {
      init: true,
      user: createMockUser(EUserRole.OWNER),
      loading: false,
    });
    store.refreshState();

    const result = await firstValueFrom(executeGuard());
    expect(result).toBe(true);
  });

  it('should redirect to /settings/profile when user is MEMBER', async () => {
    store.overrideSelector(selectAuth, {
      init: true,
      user: createMockUser(EUserRole.MEMBER),
      loading: false,
    });
    store.refreshState();

    const result = await firstValueFrom(executeGuard());
    expect(result).toEqual(router.createUrlTree(['/settings/profile']));
  });

  it('should redirect to /settings/profile when user is null', async () => {
    store.overrideSelector(selectAuth, {
      init: true,
      user: null,
      loading: false,
    });
    store.refreshState();

    const result = await firstValueFrom(executeGuard());
    expect(result).toEqual(router.createUrlTree(['/settings/profile']));
  });

  it('should wait until init is true before emitting', () => {
    let emitted = false;

    executeGuard().subscribe(() => {
      emitted = true;
    });

    expect(emitted).toBe(false);

    store.overrideSelector(selectAuth, {
      init: true,
      user: createMockUser(EUserRole.ADMIN),
      loading: false,
    });
    store.refreshState();

    expect(emitted).toBe(true);
  });
});
