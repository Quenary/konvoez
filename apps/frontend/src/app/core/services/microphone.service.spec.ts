import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  (globalThis as { AudioWorkletNode: unknown }).AudioWorkletNode =
    class AudioWorkletNode {};
});

vi.mock('@sapphi-red/web-noise-suppressor', () => ({
  SpeexWorkletNode: class SpeexWorkletNode {},
  loadSpeex: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
}));

import { MicrophoneService } from './microphone.service';
import type { SpeexWorkletNode } from '@sapphi-red/web-noise-suppressor';

describe('MicrophoneService', () => {
  let service: MicrophoneService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [MicrophoneService],
    });

    service = TestBed.inject(MicrophoneService);
  });

  it('should release the microphone stream and clear the pipeline', async () => {
    const stop = vi.fn();
    const track = { id: 'track-1', readyState: 'live', stop };
    const stream = {
      getAudioTracks: () => [track],
    } as unknown as MediaStream;

    const sourceNode = { disconnect: vi.fn() };
    const gainNode = { disconnect: vi.fn() };
    const biquadNode = { disconnect: vi.fn() };
    const speexNode = { disconnect: vi.fn() };
    const destinationNode = { disconnect: vi.fn() };
    const context = {
      state: 'running',
      close: vi.fn(),
      createMediaStreamSource: vi.fn(),
      createGain: vi.fn(() => gainNode),
      createBiquadFilter: vi.fn(() => biquadNode),
      createAnalyser: vi.fn(),
      createMediaStreamDestination: vi.fn(() => destinationNode),
      audioWorklet: { addModule: vi.fn() },
    };

    service['context'] = context as unknown as AudioContext;
    service['inputStream'] = stream;
    service['sourceNode'] = sourceNode as unknown as MediaStreamAudioSourceNode;
    service['gainNode'] = gainNode as unknown as GainNode;
    service['biquadNode'] = biquadNode as unknown as BiquadFilterNode;
    service['speexNode'] = speexNode as unknown as SpeexWorkletNode;
    service['destinationNode'] =
      destinationNode as unknown as MediaStreamAudioDestinationNode;
    service['_processedStream'].set(stream);

    await service.release();

    expect(stop).toHaveBeenCalled();
    expect(context.close).toHaveBeenCalledTimes(1);
    expect(service.processedStream()).toBeNull();
  });
});
