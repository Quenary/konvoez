import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DirectCallService } from './direct-call.service';
import { VoiceLeaveService } from './voice-leave.service';
import { VoiceSessionService } from './voice-session.service';

describe('VoiceLeaveService', () => {
  let service: VoiceLeaveService;
  let router: Router;
  let directCallService: {
    isCallActive: ReturnType<typeof vi.fn>;
    leaveCall: ReturnType<typeof vi.fn>;
  };
  let voiceSessionService: {
    leaveSession: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
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
        provideRouter([
          { path: 'voice-room/:id', children: [] },
          { path: 'direct/:id', children: [] },
          { path: '', children: [] },
        ]),
        { provide: DirectCallService, useValue: directCallService },
        { provide: VoiceSessionService, useValue: voiceSessionService },
      ],
    });

    router = TestBed.inject(Router);
    service = TestBed.inject(VoiceLeaveService);
    await router.navigateByUrl('/');
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

  it('navigates home before the session leave finishes on the voice room route', async () => {
    await router.navigateByUrl('/voice-room/4');
    const navigate = vi.spyOn(router, 'navigate');
    let navigatedBeforeLeave = false;
    voiceSessionService.leaveSession.mockImplementation(() => {
      navigatedBeforeLeave = navigate.mock.calls.length > 0;
      return Promise.resolve();
    });

    await service.leaveFromVoiceUi();

    expect(navigatedBeforeLeave).toBe(true);
    expect(navigate).toHaveBeenCalledWith(['/']);
    expect(voiceSessionService.leaveSession).toHaveBeenCalledTimes(1);
    expect(directCallService.leaveCall).not.toHaveBeenCalled();
  });

  it('does not navigate when another route is open', async () => {
    await router.navigateByUrl('/direct/7');
    const navigate = vi.spyOn(router, 'navigate');

    await service.leaveFromVoiceUi();

    expect(navigate).not.toHaveBeenCalled();
    expect(voiceSessionService.leaveSession).toHaveBeenCalledTimes(1);
  });

  it('leaves a direct call from the voice UI without leaving the media session', async () => {
    await router.navigateByUrl('/direct/7');
    const navigate = vi.spyOn(router, 'navigate');
    directCallService.isCallActive.mockReturnValue(true);

    await service.leaveFromVoiceUi();

    expect(navigate).not.toHaveBeenCalled();
    expect(directCallService.leaveCall).toHaveBeenCalledTimes(1);
    expect(voiceSessionService.leaveSession).not.toHaveBeenCalled();
  });
});
