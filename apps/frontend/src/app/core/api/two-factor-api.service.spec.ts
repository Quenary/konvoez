import { HttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { TwoFactorApiService } from './two-factor-api.service';

describe('TwoFactorApiService', () => {
  it('calls two-factor endpoints with withCredentials: true', () => {
    const post = vi.fn().mockReturnValue(of({}));

    TestBed.configureTestingModule({
      providers: [
        TwoFactorApiService,
        {
          provide: HttpClient,
          useValue: { post },
        },
      ],
    });

    const service = TestBed.inject(TwoFactorApiService);

    service.setup({ password: 'secret' }).subscribe();
    expect(post).toHaveBeenCalledWith(
      '/api/v1/profile/2fa/setup',
      { password: 'secret' },
      { withCredentials: true },
    );

    service.enable({ code: '123456' }).subscribe();
    expect(post).toHaveBeenCalledWith(
      '/api/v1/profile/2fa/enable',
      { code: '123456' },
      { withCredentials: true },
    );

    service.disable({ password: 'secret', code: '123456' }).subscribe();
    expect(post).toHaveBeenCalledWith(
      '/api/v1/profile/2fa/disable',
      { password: 'secret', code: '123456' },
      { withCredentials: true },
    );

    service
      .regenerateRecoveryCodes({ password: 'secret', code: '123456' })
      .subscribe();
    expect(post).toHaveBeenCalledWith(
      '/api/v1/profile/2fa/recovery-codes',
      { password: 'secret', code: '123456' },
      { withCredentials: true },
    );
  });
});
