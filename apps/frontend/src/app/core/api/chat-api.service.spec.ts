import { HttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { ChatApiService } from './chat-api.service';

describe('ChatApiService', () => {
  it('parses message dates when listing messages', async () => {
    const post = vi.fn().mockReturnValue(
      of({
        items: [
          {
            id: 'm1',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-02T00:00:00.000Z',
          },
        ],
        total: 1,
      }),
    );

    TestBed.configureTestingModule({
      providers: [ChatApiService, { provide: HttpClient, useValue: { post } }],
    });

    const res = await firstValueFrom(
      TestBed.inject(ChatApiService).list({
        roomId: 1,
        limit: 10,
        beforeId: null,
        afterId: null,
        recipientId: null,
      }),
    );

    expect(res.items[0].createdAt).toBeInstanceOf(Date);
    expect(res.items[0].updatedAt).toBeInstanceOf(Date);
  });
});
