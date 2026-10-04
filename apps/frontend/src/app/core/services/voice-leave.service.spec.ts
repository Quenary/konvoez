import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DirectCallService } from './direct-call.service';
import { VoiceLeaveService } from './voice-leave.service';
import { VoiceSessionService } from './voice-session.service';

describe('VoiceLeaveService', () => {
  let service: VoiceLeaveService;
  let directCallService: {
    isCallActive: ReturnType<typeof vi.fn>;
    leaveCall: ReturnType<typeof vi.fn>;
  };
  let voiceSessionService: {
    leaveSession: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    directCallService = {
      isCallActive: vi.fn().mockReturnValue(false),
      leaveCall: vi.fn().mockResolvedValue(undefined),
    };
    voiceSessionService = {
      leaveSession: vi.fn().mockResolvedValue(undefined),
    };

    TestBed.configureTestingModule({
      providers: [
        VoiceLeaveService,
        { provide: DirectCallService, useValue: directCallService },
        { provide: VoiceSessionService, useValue: voiceSessionService },
      ],
    });

    service = TestBed.inject(VoiceLeaveService);
  });

  it('leaves a direct call when one is active', async () => {
    directCallService.isCallActive.mockReturnValue(true);

    await service.leaveActiveVoice();

    expect(directCallService.leaveCall).toHaveBeenCalledTimes(1);
    expect(voiceSessionService.leaveSession).not.toHaveBeenCalled();
  });

  it('leaves the media session when no call is active', async () => {
    await service.leaveActiveVoice();

    expect(directCallService.leaveCall).not.toHaveBeenCalled();
    expect(voiceSessionService.leaveSession).toHaveBeenCalledTimes(1);
  });
});
