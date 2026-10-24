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

  it('plays 3 ascending tones on playStreamStartAudio with pauses between notes', () => {
    service.playStreamStartAudio();

    expect(createdOscillators).toHaveLength(3);
    expect(createdOscillators[0].frequency.setValueAtTime).toHaveBeenCalledWith(
      587.33,
      expect.any(Number),
    );
    expect(createdOscillators[1].frequency.setValueAtTime).toHaveBeenCalledWith(
      880,
      expect.any(Number),
    );
    expect(createdOscillators[2].frequency.setValueAtTime).toHaveBeenCalledWith(
      1174.66,
      expect.any(Number),
    );

    // Verify positive pauses between consecutive notes
    const start0 = createdOscillators[0].start.mock.calls[0][0];
    const start1 = createdOscillators[1].start.mock.calls[0][0];
    const start2 = createdOscillators[2].start.mock.calls[0][0];
    expect(start1).toBeGreaterThan(start0 + 0.07);
    expect(start2).toBeGreaterThan(start1 + 0.07);

    expect(resumeService.register).toHaveBeenCalledTimes(1);
  });

  it('plays 3 descending tones on playStreamStopAudio with pauses between notes', () => {
    service.playStreamStopAudio();

    expect(createdOscillators).toHaveLength(3);
    expect(createdOscillators[0].frequency.setValueAtTime).toHaveBeenCalledWith(
      1174.66,
      expect.any(Number),
    );
    expect(createdOscillators[1].frequency.setValueAtTime).toHaveBeenCalledWith(
      880,
      expect.any(Number),
    );
    expect(createdOscillators[2].frequency.setValueAtTime).toHaveBeenCalledWith(
      587.33,
      expect.any(Number),
    );

    const start0 = createdOscillators[0].start.mock.calls[0][0];
    const start1 = createdOscillators[1].start.mock.calls[0][0];
    const start2 = createdOscillators[2].start.mock.calls[0][0];
    expect(start1).toBeGreaterThan(start0 + 0.07);
    expect(start2).toBeGreaterThan(start1 + 0.07);
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

  describe('audio management cues', () => {
    it.each([
      {
        name: 'playUnmuteAudio',
        method: (s: AudioService) => s.playUnmuteAudio(),
        expectedFreqs: [523.25, 880],
        direction: 'ascending',
        hasPause: true,
      },
      {
        name: 'playMuteAudio',
        method: (s: AudioService) => s.playMuteAudio(),
        expectedFreqs: [880, 523.25],
        direction: 'descending',
        hasPause: true,
      },
      {
        name: 'playUndeafenAudio',
        method: (s: AudioService) => s.playUndeafenAudio(),
        expectedFreqs: [261.63, 440],
        direction: 'ascending',
        hasPause: true,
      },
      {
        name: 'playDeafenAudio',
        method: (s: AudioService) => s.playDeafenAudio(),
        expectedFreqs: [440, 261.63],
        direction: 'descending',
        hasPause: true,
      },
    ])(
      'plays $direction 2-tone sequence for $name',
      ({ method, expectedFreqs, hasPause }) => {
        method(service);
        expect(createdOscillators).toHaveLength(2);
        expect(
          createdOscillators[0].frequency.setValueAtTime,
        ).toHaveBeenCalledWith(expectedFreqs[0], expect.any(Number));
        expect(
          createdOscillators[1].frequency.setValueAtTime,
        ).toHaveBeenCalledWith(expectedFreqs[1], expect.any(Number));

        if (hasPause) {
          const start0 = createdOscillators[0].start.mock.calls[0][0];
          const start1 = createdOscillators[1].start.mock.calls[0][0];
          expect(start1).toBeGreaterThan(start0 + 0.06);
        }
      },
    );
  });

  it('throttles rapid consecutive calls to audio cues', () => {
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

    createdOscillators = [];
    service.playMuteAudio();
    expect(createdOscillators).toHaveLength(2);
    service.playMuteAudio();
    expect(createdOscillators).toHaveLength(2);

    createdOscillators = [];
    service.playDeafenAudio();
    expect(createdOscillators).toHaveLength(2);
    service.playDeafenAudio();
    expect(createdOscillators).toHaveLength(2);

    createdOscillators = [];
    service.playPeerJoinAudio();
    expect(createdOscillators).toHaveLength(2);
    service.playPeerJoinAudio();
    expect(createdOscillators).toHaveLength(2);

    createdOscillators = [];
    service.playPeerLeaveAudio();
    expect(createdOscillators).toHaveLength(2);
    service.playPeerLeaveAudio();
    expect(createdOscillators).toHaveLength(2);
  });
});
