import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest';
import {
  IVoiceQualityAdapter,
  VoiceQualityService,
} from './voice-quality.service';
import {
  buildVoiceLadder,
  EVoiceQualityTier,
  TVoiceLadderEntry,
  TVoiceQualitySample,
} from '@konvoez/shared';

describe('VoiceQualityService', () => {
  let service: VoiceQualityService;
  let adapter: IVoiceQualityAdapter;
  let readSample: ReturnType<typeof vi.fn<() => Promise<TVoiceQualitySample>>>;
  let applyQualityLevel: ReturnType<
    typeof vi.fn<(entry: TVoiceLadderEntry) => Promise<void>>
  >;

  beforeEach(() => {
    vi.useFakeTimers();

    readSample = vi.fn().mockResolvedValue({
      score: null,
      loss: null,
      rttMs: null,
      jitterMs: null,
    });
    applyQualityLevel = vi.fn().mockResolvedValue(undefined);
    adapter = {
      readSample,
      applyQualityLevel,
    };

    TestBed.configureTestingModule({
      providers: [VoiceQualityService],
    });

    service = TestBed.inject(VoiceQualityService);
  });

  afterEach(() => {
    service.stop();
    vi.useRealTimers();
  });

  it('initializes with default tier EXCELLENT and 64 kbps', () => {
    expect(service.tier()).toBe(EVoiceQualityTier.EXCELLENT);
    expect(service.bitrateKbps()).toBe(64);
  });

  it('does not start polling timer for a single-entry ladder (base 8)', () => {
    const ladder8 = buildVoiceLadder(8);
    expect(ladder8.length).toBe(1);

    service.start(ladder8, adapter);
    expect(service.tier()).toBe(EVoiceQualityTier.EXCELLENT);
    expect(service.bitrateKbps()).toBe(8);

    vi.advanceTimersByTime(10000);
    expect(readSample).not.toHaveBeenCalled();
  });

  it('starts polling loop for multi-entry ladder and adapts on quality change', async () => {
    const ladder64 = buildVoiceLadder(64);
    service.start(ladder64, adapter);

    expect(service.tier()).toBe(EVoiceQualityTier.EXCELLENT);
    expect(service.bitrateKbps()).toBe(64);

    const badSample: TVoiceQualitySample = {
      score: 2,
      loss: 20,
      rttMs: 700,
      jitterMs: 90,
    };
    readSample.mockResolvedValue(badSample);

    // 1st tick at 2s: detected bad sample, but fast down needs 2 consecutive samples
    await vi.advanceTimersByTimeAsync(2000);
    expect(readSample).toHaveBeenCalledTimes(1);
    expect(service.tier()).toBe(EVoiceQualityTier.EXCELLENT);
    expect(applyQualityLevel).not.toHaveBeenCalled();

    // 2nd tick at 4s: 2nd consecutive bad sample -> drops to Tier 3 (16 kbps)
    await vi.advanceTimersByTimeAsync(2000);
    expect(readSample).toHaveBeenCalledTimes(2);
    expect(service.tier()).toBe(EVoiceQualityTier.BAD);
    expect(service.bitrateKbps()).toBe(16);
    expect(applyQualityLevel).toHaveBeenCalledWith({
      tier: EVoiceQualityTier.BAD,
      kbps: 16,
    });
  });

  it('resets signals and stops loop on stop()', async () => {
    const ladder64 = buildVoiceLadder(64);
    service.start(ladder64, adapter);

    const badSample: TVoiceQualitySample = {
      score: 2,
      loss: 20,
      rttMs: 700,
      jitterMs: 90,
    };
    readSample.mockResolvedValue(badSample);

    // Drop to tier 3
    await vi.advanceTimersByTimeAsync(2000);
    await vi.advanceTimersByTimeAsync(2000);
    expect(service.tier()).toBe(EVoiceQualityTier.BAD);

    service.stop();
    expect(service.tier()).toBe(EVoiceQualityTier.EXCELLENT);
    expect(service.bitrateKbps()).toBe(64);

    readSample.mockClear();
    await vi.advanceTimersByTimeAsync(6000);
    expect(readSample).not.toHaveBeenCalled();
  });

  it('ignores in-flight sample when stop() is called while readSample is pending', async () => {
    const ladder64 = buildVoiceLadder(64);
    let resolveSample!: (value: TVoiceQualitySample) => void;
    readSample.mockImplementation(
      () =>
        new Promise<TVoiceQualitySample>((resolve) => {
          resolveSample = resolve;
        }),
    );

    service.start(ladder64, adapter);

    // Trigger tick
    vi.advanceTimersByTime(2000);
    expect(readSample).toHaveBeenCalledTimes(1);

    // Stop while readSample is still awaiting
    service.stop();
    expect(service.tier()).toBe(EVoiceQualityTier.EXCELLENT);

    // Resolve sample with bad quality
    resolveSample({
      score: 1,
      loss: 30,
      rttMs: 800,
      jitterMs: 120,
    });
    await Promise.resolve();

    // Must remain EXCELLENT and applyQualityLevel not called
    expect(service.tier()).toBe(EVoiceQualityTier.EXCELLENT);
    expect(applyQualityLevel).not.toHaveBeenCalled();
  });
});
