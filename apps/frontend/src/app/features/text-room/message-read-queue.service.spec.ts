import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MessageReadQueueService } from './message-read-queue.service';
import { TextRoomApiService } from './text-room-api.service';

describe('MessageReadQueueService', () => {
  let service: MessageReadQueueService;
  let apiService: { markRead: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.useFakeTimers();
    apiService = {
      markRead: vi.fn(() => of(undefined)),
    };

    TestBed.configureTestingModule({
      providers: [
        MessageReadQueueService,
        { provide: TextRoomApiService, useValue: apiService },
      ],
    });

    service = TestBed.inject(MessageReadQueueService);
  });

  afterEach(() => {
    service.ngOnDestroy();
    vi.useRealTimers();
  });

  it('should debounce and send unique message ids', () => {
    service.enqueue('msg-1');
    service.enqueue('msg-2');
    service.enqueue('msg-1');

    expect(apiService.markRead).not.toHaveBeenCalled();

    vi.advanceTimersByTime(800);

    expect(apiService.markRead).toHaveBeenCalledTimes(1);
    expect(apiService.markRead).toHaveBeenCalledWith(['msg-1', 'msg-2']);
  });

  it('should not flush ids cleared by reset', () => {
    service.enqueue('msg-1');
    service.reset();
    vi.advanceTimersByTime(800);

    expect(apiService.markRead).not.toHaveBeenCalled();
  });
});
