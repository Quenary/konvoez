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
import { describe, expect, it, vi } from 'vitest';
import { CLIENT_LANGUAGE_HEADER } from '@konvoez/shared';
import { clientLanguageInterceptor } from './client-language.interceptor';

describe('clientLanguageInterceptor', () => {
  let httpClient: HttpClient;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([clientLanguageInterceptor])),
        provideHttpClientTesting(),
      ],
    });

    httpClient = TestBed.inject(HttpClient);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
    vi.restoreAllMocks();
  });

  it('attaches x-konvoez-lang header with browser locale to outgoing requests', () => {
    vi.spyOn(navigator, 'language', 'get').mockReturnValue('ru-RU');

    httpClient.get('/api/v1/test').subscribe();

    const req = httpTesting.expectOne('/api/v1/test');
    expect(req.request.headers.get(CLIENT_LANGUAGE_HEADER)).toBe('ru-RU');
    req.flush({});
  });

  it('omits header when navigator.language is empty', () => {
    vi.spyOn(navigator, 'language', 'get').mockReturnValue('');

    httpClient.get('/api/v1/test').subscribe();

    const req = httpTesting.expectOne('/api/v1/test');
    expect(req.request.headers.has(CLIENT_LANGUAGE_HEADER)).toBe(false);
    req.flush({});
  });
});
