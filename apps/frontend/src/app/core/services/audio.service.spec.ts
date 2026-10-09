import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioContextResumeService } from './audio-context-resume.service';
import { AudioService } from './audio.service';

describe('AudioService', () => {
  let service: AudioService;
  let resumeService: { register: ReturnType<typeof vi.fn> };
  let createdOscillators: Array<{
    type: string;
    frequency: { setValueAtTime: ReturnType<typeof vi.fn> };
    connect: ReturnType<typeof vi.fn>;
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
  }>;
  let createdGains: Array<{
    gain: {
      setValueAtTime: ReturnType<typeof vi.fn>;
      linearRampToValueAtTime: ReturnType<typeof vi.fn>;
      exponentialRampToValueAtTime: ReturnType<typeof vi.fn>;
    };
    connect: ReturnType<typeof vi.fn>;
  }>;

  beforeEach(() => {
    createdOscillators = [];
    createdGains = [];
    resumeService = { register: vi.fn() };

    class FakeAudioContext {
      public currentTime = 1;
      public state = 'running';
      public destination = {};
      public resume = vi.fn().mockResolvedValue(undefined);

      public createOscillator() {
        const osc = {
          type: 'sine',
          frequency: { setValueAtTime: vi.fn() },
          connect: vi.fn(),
          start: vi.fn(),
          stop: vi.fn(),
        };
        createdOscillators.push(osc);
        return osc;
      }

      public createGain() {
        const gain = {
          gain: {
            setValueAtTime: vi.fn(),
            linearRampToValueAtTime: vi.fn(),
            exponentialRampToValueAtTime: vi.fn(),
          },
          connect: vi.fn(),
        };
        createdGains.push(gain);
        return gain;
      }
    }

    vi.stubGlobal('AudioContext', FakeAudioContext);

    TestBed.configureTestingModule({
      providers: [
        AudioService,
        { provide: AudioContextResumeService, useValue: resumeService },
      ],
    });

    service = TestBed.inject(AudioService);
  });

  it('plays 3 ascending tones on playStreamStartAudio', () => {
    service.playStreamStartAudio();

    expect(createdOscillators).toHaveLength(3);
    expect(createdOscillators[0].frequency.setValueAtTime).toHaveBeenCalledWith(
      587.33,
      expect.any(Number),
    );
    expect(createdOscillators[1].frequency.setValueAtTime).toHaveBeenCalledWith(
      739.99,
      expect.any(Number),
    );
    expect(createdOscillators[2].frequency.setValueAtTime).toHaveBeenCalledWith(
      880,
      expect.any(Number),
    );
    expect(resumeService.register).toHaveBeenCalledTimes(1);
  });

  it('plays 3 descending tones on playStreamStopAudio', () => {
    service.playStreamStopAudio();

    expect(createdOscillators).toHaveLength(3);
    expect(createdOscillators[0].frequency.setValueAtTime).toHaveBeenCalledWith(
      880,
      expect.any(Number),
    );
    expect(createdOscillators[1].frequency.setValueAtTime).toHaveBeenCalledWith(
      739.99,
      expect.any(Number),
    );
    expect(createdOscillators[2].frequency.setValueAtTime).toHaveBeenCalledWith(
      587.33,
      expect.any(Number),
    );
  });

  it('plays join and leave audio with expected tones', () => {
    service.playPeerJoinAudio();
    expect(createdOscillators).toHaveLength(2);
    expect(createdOscillators[0].frequency.setValueAtTime).toHaveBeenCalledWith(
      648,
      expect.any(Number),
    );
    expect(createdOscillators[1].frequency.setValueAtTime).toHaveBeenCalledWith(
      864,
      expect.any(Number),
    );

    createdOscillators = [];
    service.playPeerLeaveAudio();
    expect(createdOscillators).toHaveLength(2);
    expect(createdOscillators[0].frequency.setValueAtTime).toHaveBeenCalledWith(
      659.25,
      expect.any(Number),
    );
    expect(createdOscillators[1].frequency.setValueAtTime).toHaveBeenCalledWith(
      523.25,
      expect.any(Number),
    );
  });

  it('throttles rapid consecutive calls to playStreamStartAudio and playStreamStopAudio', () => {
    service.playStreamStartAudio();
    expect(createdOscillators).toHaveLength(3);

    // Call immediately again — should be throttled
    service.playStreamStartAudio();
    expect(createdOscillators).toHaveLength(3);

    createdOscillators = [];
    service.playStreamStopAudio();
    expect(createdOscillators).toHaveLength(3);

    // Call immediately again — should be throttled
    service.playStreamStopAudio();
    expect(createdOscillators).toHaveLength(3);
  });
});
