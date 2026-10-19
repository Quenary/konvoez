import {
  HttpClient,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideMockStore, MockStore } from '@ngrx/store/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { of, throwError } from 'rxjs';
import { AuthApiService } from '@core/api/auth-api.service';
import { AuthActions } from '@core/auth/auth.actions';
import { selectIsAuthorized } from '@core/auth/auth.selectors';
import { TokenRefreshService } from '@core/auth/token-refresh.service';
import { environment } from '@environments/environment';
import { authInterceptor } from './auth.interceptor';

describe('authInterceptor', () => {
  let http: HttpClient;
  let httpTesting: HttpTestingController;
  let store: MockStore;
  let authApi: { refresh: ReturnType<typeof vi.fn> };

  const apiUrl = `${environment.apiPath}/resource`;

  beforeEach(() => {
    authApi = {
      refresh: vi.fn(() => of(undefined)),
    };

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        TokenRefreshService,
        provideMockStore(),
        { provide: AuthApiService, useValue: authApi },
      ],
    });

    http = TestBed.inject(HttpClient);
    httpTesting = TestBed.inject(HttpTestingController);
    store = TestBed.inject(MockStore);
    vi.spyOn(store, 'dispatch');
  });

  afterEach(() => {
    store.resetSelectors();
    TestBed.resetTestingModule();
  });

  it('single-flights refresh for two parallel 401s and retries both', async () => {
    const results: unknown[] = [];

    http.get(apiUrl).subscribe({ next: (v) => results.push(v) });
    http.get(`${apiUrl}/2`).subscribe({ next: (v) => results.push(v) });

    httpTesting
      .expectOne(apiUrl)
      .flush('unauthorized', { status: 401, statusText: 'Unauthorized' });
    httpTesting
      .expectOne(`${apiUrl}/2`)
      .flush('unauthorized', { status: 401, statusText: 'Unauthorized' });

    await vi.waitFor(() => {
      expect(authApi.refresh).toHaveBeenCalledTimes(1);
    });

    await vi.waitFor(() => {
      const retry1 = httpTesting.match(apiUrl);
      const retry2 = httpTesting.match(`${apiUrl}/2`);
      if (retry1.length !== 1 || retry2.length !== 1) {
        throw new Error('retries not ready');
      }
      retry1[0].flush({ ok: 1 });
      retry2[0].flush({ ok: 2 });
      expect(results).toEqual([{ ok: 1 }, { ok: 2 }]);
    });

    expect(store.dispatch).not.toHaveBeenCalled();
  });

  it('dispatches sessionExpired once when refresh fails', async () => {
    store.overrideSelector(selectIsAuthorized, true);
    store.refreshState();
    authApi.refresh.mockReturnValue(throwError(() => new Error('401')));

    http.get(apiUrl).subscribe({ error: () => undefined });
    http.get(`${apiUrl}/b`).subscribe({ error: () => undefined });

    httpTesting
      .expectOne(apiUrl)
      .flush(null, { status: 401, statusText: 'Unauthorized' });
    httpTesting
      .expectOne(`${apiUrl}/b`)
      .flush(null, { status: 401, statusText: 'Unauthorized' });

    await vi.waitFor(() => {
      expect(authApi.refresh).toHaveBeenCalledTimes(1);
      expect(store.dispatch).toHaveBeenCalledTimes(1);
      expect(store.dispatch).toHaveBeenCalledWith(AuthActions.sessionExpired());
    });
  });

  it('does not intercept 401 on login or refresh endpoints', () => {
    const loginUrl = `${environment.apiPath}/auth/login`;
    http.post(loginUrl, {}).subscribe({ error: () => undefined });
    httpTesting.expectOne(loginUrl).flush(null, {
      status: 401,
      statusText: 'Unauthorized',
    });

    const refreshUrl = `${environment.apiPath}/auth/refresh`;
    http.post(refreshUrl, {}).subscribe({ error: () => undefined });
    httpTesting.expectOne(refreshUrl).flush(null, {
      status: 401,
      statusText: 'Unauthorized',
    });
    expect(authApi.refresh).not.toHaveBeenCalled();
    expect(store.dispatch).not.toHaveBeenCalled();
  });
});
