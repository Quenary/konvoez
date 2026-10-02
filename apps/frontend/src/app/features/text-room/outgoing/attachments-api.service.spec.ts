import { HttpBackend, HttpXhrBackend } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
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
