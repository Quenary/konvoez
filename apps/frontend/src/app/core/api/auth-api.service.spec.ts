import { HttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { AuthApiService } from './auth-api.service';

describe('AuthApiService', () => {
  it('calls login/2fa with withCredentials: true', () => {
    const post = vi.fn().mockReturnValue(of({}));

    TestBed.configureTestingModule({
      providers: [
        AuthApiService,
        {
          provide: HttpClient,
          useValue: { post },
        },
      ],
    });

    const service = TestBed.inject(AuthApiService);

    service.loginTwoFactor({ code: '123456' }).subscribe();
    expect(post).toHaveBeenCalledWith(
      '/api/v1/auth/login/2fa',
      { code: '123456' },
      { withCredentials: true },
    );
  });
});
