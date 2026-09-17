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
import { authGuard } from './auth.guard';
import { firstValueFrom, Observable } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';
import { EUserRole, IUser } from '@konvoez/shared';

describe('authGuard', () => {
  let store: MockStore;
  let router: Router;

  const executeGuard = () => {
    return TestBed.runInInjectionContext(() =>
      authGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
    ) as Observable<boolean | UrlTree>;
  };

  const mockUser: IUser = {
    id: 1,
    username: 'testuser',
    fullname: 'Test User',
    email: 'test@example.com',
    role: EUserRole.MEMBER,
    avatar: null,
    createdAt: new Date(),
    updatedAt: null,
  };

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

  it('should return true when user is authenticated and init is true', async () => {
    store.overrideSelector(selectAuth, {
      init: true,
      user: mockUser,
      loading: false,
    });
    store.refreshState();

    const result = await firstValueFrom(executeGuard());
    expect(result).toBe(true);
  });

  it('should return UrlTree to /auth when user is not authenticated and init is true', async () => {
    store.overrideSelector(selectAuth, {
      init: true,
      user: null,
      loading: false,
    });
    store.refreshState();

    const result = await firstValueFrom(executeGuard());
    expect(result).toEqual(router.createUrlTree(['/auth']));
  });

  it('should wait until init is true before emitting', () => {
    let emitted = false;

    executeGuard().subscribe(() => {
      emitted = true;
    });

    expect(emitted).toBe(false);

    store.overrideSelector(selectAuth, {
      init: true,
      user: mockUser,
      loading: false,
    });
    store.refreshState();

    expect(emitted).toBe(true);
  });
});
