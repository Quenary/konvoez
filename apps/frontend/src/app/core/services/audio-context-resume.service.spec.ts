import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppResumeService } from './app-resume.service';
import { AudioContextResumeService } from './audio-context-resume.service';

describe('AudioContextResumeService', () => {
  let service: AudioContextResumeService;
  let resumeSubject: Subject<{ sleptMs: number }>;

  beforeEach(() => {
    resumeSubject = new Subject();

    TestBed.configureTestingModule({
      providers: [
        AudioContextResumeService,
        {
          provide: AppResumeService,
          useValue: { resume$: resumeSubject.asObservable() },
        },
      ],
    });

    service = TestBed.inject(AudioContextResumeService);
  });

  it('updates suspended signal and resumes context on statechange to suspended', () => {
    const listeners: Record<string, () => void> = {};
    const mockContext = {
      state: 'running' as AudioContextState,
      resume: vi.fn().mockResolvedValue(undefined),
      addEventListener: vi.fn(
        (event: string, callback: () => void) => (listeners[event] = callback),
      ),
      removeEventListener: vi.fn(),
    };

    service.register(mockContext as unknown as AudioContext);
    expect(service.suspended()).toBe(false);

    mockContext.state = 'suspended';
    listeners['statechange']?.();

    expect(service.suspended()).toBe(true);
    expect(mockContext.resume).toHaveBeenCalled();
  });

  it('resumes registered contexts on app resume event', () => {
    const mockContext = {
      state: 'suspended' as AudioContextState,
      resume: vi.fn().mockResolvedValue(undefined),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };

    service.register(mockContext as unknown as AudioContext);
    mockContext.resume.mockClear();

    resumeSubject.next({ sleptMs: 5000 });
    expect(mockContext.resume).toHaveBeenCalled();
  });

  it('detaches statechange listener and recomputes suspended on unregister', () => {
    const mockContext = {
      state: 'suspended' as AudioContextState,
      resume: vi.fn().mockResolvedValue(undefined),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };

    service.register(mockContext as unknown as AudioContext);
    expect(service.suspended()).toBe(true);

    service.unregister(mockContext as unknown as AudioContext);
    expect(mockContext.removeEventListener).toHaveBeenCalledWith(
      'statechange',
      expect.any(Function),
    );
    expect(service.suspended()).toBe(false);
  });
});
