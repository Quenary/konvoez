import { HttpBackend, HttpClient, HttpXhrBackend } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { provideAppHttpClient } from '../../../app.config';
import { AttachmentsApiService } from './attachments-api.service';

describe('attachment upload transport', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideAppHttpClient()] });
  });

  it('uses XHR so upload progress does not throw before the request', () => {
    expect(TestBed.inject(HttpBackend)).toBeInstanceOf(HttpXhrBackend);

    let error: unknown;
    TestBed.inject(AttachmentsApiService)
      .upload(new File(['x'], 'a.png', { type: 'image/png' }))
      .subscribe({
        error: (value) => {
          error = value;
        },
      });
    expect(error).toBeUndefined();
  });
});

describe('attachment upload fields', () => {
  it('appends hints, poster, then the file', () => {
    const post = vi.fn(
      (_url: string, body: FormData, _options?: { headers?: unknown }) =>
        of(body),
    );
    TestBed.configureTestingModule({
      providers: [
        AttachmentsApiService,
        { provide: HttpClient, useValue: { post } },
      ],
    });
    const poster = new File(['p'], 'poster.webp', { type: 'image/webp' });
    const file = new File(['v'], 'clip.mp4', { type: 'video/mp4' });
    const slice = vi.spyOn(file, 'slice');
    TestBed.inject(AttachmentsApiService)
      .upload(file, {
        videoWidth: 1920,
        videoHeight: 1080,
        videoDuration: 3.5,
        poster,
      })
      .subscribe();
    const body = post.mock.calls[0]?.[1];
    expect(body).toBeInstanceOf(FormData);
    if (!(body instanceof FormData)) {
      return;
    }
    expect([...body.keys()]).toEqual([
      'videoWidth',
      'videoHeight',
      'videoDuration',
      'poster',
      'file',
    ]);
    expect(body.get('videoDuration')).toBe('3.5');
    expect((body.get('file') as File).name).toBe('clip.mp4');
    expect(slice).toHaveBeenCalledWith(0, file.size, 'video/mp4');
    expect(post.mock.calls[0]?.[2]?.headers).toEqual({ 'ngsw-bypass': 'true' });
    expect((body.get('poster') as File).name).toBe('poster.webp');
  });
});
