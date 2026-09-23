import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SpeakerService } from './speaker.service';

describe('SpeakerService', () => {
  let service: SpeakerService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [SpeakerService],
    });

    service = TestBed.inject(SpeakerService);
  });

  it('should release the speaker context and reset the sink', async () => {
    const context = {
      state: 'running',
      close: vi.fn(),
      setSinkId: vi.fn(),
    } as any;

    service['context'] = context;
    service['device'] = { deviceId: 'speaker-1' } as MediaDeviceInfo;

    await service.release();

    expect(context.setSinkId).toHaveBeenCalledWith('default');
    expect(context.close).toHaveBeenCalledTimes(1);
    expect(service['context']).toBeNull();
  });
});
