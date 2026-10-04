import { HttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { ProfileApiService } from './profile-api.service';

describe('ProfileApiService avatar upload', () => {
  it('sends a slice of the picked file under its name', () => {
    const post = vi.fn((_url: string, body: FormData) => of(body));
    TestBed.configureTestingModule({
      providers: [
        ProfileApiService,
        { provide: HttpClient, useValue: { post } },
      ],
    });
    const avatar = new File(['a'], 'me.png', { type: 'image/png' });
    const slice = vi.spyOn(avatar, 'slice');

    TestBed.inject(ProfileApiService).avatarUpload(avatar).subscribe();

    const [url, body] = post.mock.calls[0] ?? [];
    expect(url).toContain('/profile/avatar/upload');
    expect(body).toBeInstanceOf(FormData);
    expect((body?.get('avatar') as File).name).toBe('me.png');
    expect(slice).toHaveBeenCalledWith(0, avatar.size, 'image/png');
  });
});
