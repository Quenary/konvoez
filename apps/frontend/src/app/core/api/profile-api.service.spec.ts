import { HttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { ProfileApiService } from './profile-api.service';

describe('ProfileApiService avatar upload', () => {
  it('sends a slice of the picked file under its name', () => {
    const post = vi.fn(
      (_url: string, body: FormData, _options?: { headers?: unknown }) =>
        of(body),
    );
    TestBed.configureTestingModule({
      providers: [
        ProfileApiService,
        { provide: HttpClient, useValue: { post } },
      ],
    });
    const avatar = new File(['a'], 'me.png', { type: 'image/png' });
    const slice = vi.spyOn(avatar, 'slice');

    TestBed.inject(ProfileApiService).avatarUpload(avatar).subscribe();

    const [url, body, options] = post.mock.calls[0] ?? [];
    expect(url).toContain('/profile/avatar/upload');
    expect(body).toBeInstanceOf(FormData);
    expect((body?.get('avatar') as File).name).toBe('me.png');
    expect(slice).toHaveBeenCalledWith(0, avatar.size, 'image/png');
    expect(options?.headers).toEqual({ 'ngsw-bypass': 'true' });
  });

  it('calls email verification and change endpoints with credentials', () => {
    const post = vi.fn().mockReturnValue(of({ ok: true }));
    TestBed.configureTestingModule({
      providers: [
        ProfileApiService,
        { provide: HttpClient, useValue: { post } },
      ],
    });
    const service = TestBed.inject(ProfileApiService);

    service.requestEmailVerification().subscribe();
    expect(post).toHaveBeenCalledWith(
      '/api/v1/profile/email-verification/request',
      {},
      { withCredentials: true },
    );

    service.confirmEmailVerification({ code: '123456' }).subscribe();
    expect(post).toHaveBeenCalledWith(
      '/api/v1/profile/email-verification/confirm',
      { code: '123456' },
      { withCredentials: true },
    );

    service.confirmEmailChange({ code: '654321' }).subscribe();
    expect(post).toHaveBeenCalledWith(
      '/api/v1/profile/email-change/confirm',
      { code: '654321' },
      { withCredentials: true },
    );

    service.resendEmailChange().subscribe();
    expect(post).toHaveBeenCalledWith(
      '/api/v1/profile/email-change/resend',
      {},
      { withCredentials: true },
    );

    service.cancelEmailChange().subscribe();
    expect(post).toHaveBeenCalledWith(
      '/api/v1/profile/email-change/cancel',
      {},
      { withCredentials: true },
    );
  });
});
