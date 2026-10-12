import { TestBed } from '@angular/core/testing';
import { provideMockStore, MockStore } from '@ngrx/store/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { of, throwError } from 'rxjs';
import { AuthApiService } from '@core/api/auth-api.service';
import { AuthActions } from './auth.actions';
import { selectIsAuthorized } from './auth.selectors';
import { TokenRefreshService } from './token-refresh.service';

describe('TokenRefreshService', () => {
  let service: TokenRefreshService;
  let authApi: { refresh: ReturnType<typeof vi.fn> };
  let store: MockStore;

  beforeEach(() => {
    authApi = {
      refresh: vi.fn(() => of(undefined)),
    };

    TestBed.configureTestingModule({
      providers: [
        TokenRefreshService,
        { provide: AuthApiService, useValue: authApi },
        provideMockStore(),
      ],
    });

    service = TestBed.inject(TokenRefreshService);
    store = TestBed.inject(MockStore);
    vi.spyOn(store, 'dispatch');
  });

  it('single-flights concurrent refresh calls', async () => {
    const first = service.refresh();
    const second = service.refresh();

    const [a, b] = await Promise.all([first, second]);
    expect(a).toBe(true);
    expect(b).toBe(true);
    expect(authApi.refresh).toHaveBeenCalledTimes(1);
    expect(store.dispatch).not.toHaveBeenCalled();
  });

  it('dispatches sessionExpired once when refresh fails while authorized', async () => {
    store.overrideSelector(selectIsAuthorized, true);
    store.refreshState();
    authApi.refresh.mockReturnValue(throwError(() => new Error('401')));

    const first = service.refresh();
    const second = service.refresh();

    const [a, b] = await Promise.all([first, second]);
    expect(a).toBe(false);
    expect(b).toBe(false);
    expect(authApi.refresh).toHaveBeenCalledTimes(1);
    expect(store.dispatch).toHaveBeenCalledTimes(1);
    expect(store.dispatch).toHaveBeenCalledWith(AuthActions.sessionExpired());
  });

  it('does not dispatch sessionExpired when refresh fails while logged out', async () => {
    store.overrideSelector(selectIsAuthorized, false);
    store.refreshState();
    authApi.refresh.mockReturnValue(throwError(() => new Error('401')));

    expect(await service.refresh()).toBe(false);
    expect(store.dispatch).not.toHaveBeenCalled();
  });

  it('starts a new request after the previous flight settles', async () => {
    await service.refresh();
    await service.refresh();
    expect(authApi.refresh).toHaveBeenCalledTimes(2);
  });
});
