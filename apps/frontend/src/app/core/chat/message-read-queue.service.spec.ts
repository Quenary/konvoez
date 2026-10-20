import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MessageReadQueueService } from './message-read-queue.service';
import { ChatApiService } from '@core/api/chat-api.service';

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
        { provide: ChatApiService, useValue: apiService },
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

  it('should skip enqueuing ids that were already sent', () => {
    service.enqueue('msg-1');
    vi.advanceTimersByTime(800);
    expect(apiService.markRead).toHaveBeenCalledTimes(1);
    expect(apiService.markRead).toHaveBeenCalledWith(['msg-1']);

    service.enqueue('msg-1');
    vi.advanceTimersByTime(800);
    expect(apiService.markRead).toHaveBeenCalledTimes(1);
  });

  it('should allow retrying failed ids after error', () => {
    apiService.markRead.mockReturnValueOnce(
      throwError(() => new Error('Network error')),
    );

    service.enqueue('msg-1');
    vi.advanceTimersByTime(800);
    expect(apiService.markRead).toHaveBeenCalledTimes(1);

    apiService.markRead.mockReturnValueOnce(of(undefined));
    service.enqueue('msg-1');
    vi.advanceTimersByTime(800);
    expect(apiService.markRead).toHaveBeenCalledTimes(2);
    expect(apiService.markRead).toHaveBeenLastCalledWith(['msg-1']);
  });

  it('should clear sentIds on reset', () => {
    service.enqueue('msg-1');
    vi.advanceTimersByTime(800);
    expect(apiService.markRead).toHaveBeenCalledTimes(1);

    service.reset();

    service.enqueue('msg-1');
    vi.advanceTimersByTime(800);
    expect(apiService.markRead).toHaveBeenCalledTimes(2);
    expect(apiService.markRead).toHaveBeenLastCalledWith(['msg-1']);
  });
});
