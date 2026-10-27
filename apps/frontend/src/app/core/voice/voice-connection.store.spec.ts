import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  EVoiceConnectionDeadReason,
  EVoiceConnectionState,
  EVoiceQualityTier,
  EVoiceSessionType,
} from '@konvoez/shared';
import { VoiceConnectionStore } from './voice-connection.store';
import { VoiceSessionStore } from './voice-session.store';
import { VoiceQualityService } from '../services/voice-quality.service';
import { MicrophoneService } from '../services/microphone.service';
import { AudioContextResumeService } from '../services/audio-context-resume.service';

describe('VoiceConnectionStore', () => {
  let store: InstanceType<typeof VoiceConnectionStore>;
  let sessionStore: InstanceType<typeof VoiceSessionStore>;
  let mockQualityTier: ReturnType<typeof signal<EVoiceQualityTier>>;
  let mockInputMuted: ReturnType<typeof signal<boolean>>;
  let mockSuspended: ReturnType<typeof signal<boolean>>;

  beforeEach(() => {
    mockQualityTier = signal(EVoiceQualityTier.EXCELLENT);
    mockInputMuted = signal(false);
    mockSuspended = signal(false);

    TestBed.configureTestingModule({
      providers: [
        {
          provide: VoiceQualityService,
          useValue: { tier: mockQualityTier },
        },
        {
          provide: MicrophoneService,
          useValue: { inputMuted: mockInputMuted },
        },
        {
          provide: AudioContextResumeService,
          useValue: { suspended: mockSuspended },
        },
      ],
    });

    store = TestBed.inject(VoiceConnectionStore);
    sessionStore = TestBed.inject(VoiceSessionStore);
  });

  it('computes state based on active session and transports', () => {
    expect(store.state()).toBeNull();

    sessionStore.setActiveSession({
      type: EVoiceSessionType.GROUP_ROOM,
      roomId: 1,
    });
    expect(store.state()).toBe(EVoiceConnectionState.CONNECTED);

    store.setTransportState('send', 'connecting');
    expect(store.state()).toBe(EVoiceConnectionState.RECONNECTING);

    store.setTransportState('send', 'connected');
    expect(store.state()).toBe(EVoiceConnectionState.CONNECTED);

    mockQualityTier.set(EVoiceQualityTier.UNSTABLE);
    expect(store.state()).toBe(EVoiceConnectionState.DEGRADED);

    store.setDead(EVoiceConnectionDeadReason.EVICTED);
    expect(store.state()).toBe(EVoiceConnectionState.DEAD);
  });

  it('clears recovering only when send transport is connected and no transport is unhealthy', () => {
    store.setRecovering(true);
    expect(store.recovering()).toBe(true);

    store.setTransportState('send', 'connecting');
    expect(store.recovering()).toBe(true);

    store.setTransportState('send', 'connected');
    expect(store.recovering()).toBe(false);

    store.setRecovering(true);
    store.setTransportState('recv', 'connecting');
    expect(store.recovering()).toBe(true);

    store.setTransportState('recv', 'connected');
    expect(store.recovering()).toBe(false);
  });

  it('resets transports and clears stalled flag', () => {
    store.setTransportState('send', 'connected');
    store.setTransportState('recv', 'connected');
    store.setStalled(true);

    store.resetTransports();
    expect(store.sendState()).toBeNull();
    expect(store.recvState()).toBeNull();
    expect(store.stalled()).toBe(false);
  });

  it('resets all connection state back to initial values', () => {
    store.setTransportState('send', 'connected');
    store.setRecovering(true);
    store.setDead(EVoiceConnectionDeadReason.RECOVERY_FAILED);
    store.setLossReported(true);
    store.setMicFailed(true);

    store.reset();
    expect(store.sendState()).toBeNull();
    expect(store.recvState()).toBeNull();
    expect(store.stalled()).toBe(false);
    expect(store.recovering()).toBe(false);
    expect(store.dead()).toBeNull();
    expect(store.lossReported()).toBe(false);
    expect(store.micFailed()).toBe(false);
  });
});
