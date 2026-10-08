import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EStorageKey } from '../../app.enums';
import { AudioService } from '@core/services/audio.service';
import { MediasoupSessionService } from '@core/services/mediasoup-session.service';
import { PeerPlaybackService } from '@core/services/peer-playback.service';
import { PeerScreenAudioService } from '@core/services/peer-screen-audio.service';
import { VoiceAudioPreferencesStore } from './voice-audio-preferences.store';

describe('VoiceAudioPreferencesStore', () => {
  let playback: {
    detach: ReturnType<typeof vi.fn>;
    detachAll: ReturnType<typeof vi.fn>;
    applySpeakerMuted: ReturnType<typeof vi.fn>;
    setPeerGain: ReturnType<typeof vi.fn>;
  };
  let screenAudio: {
    applySpeakerMuted: ReturnType<typeof vi.fn>;
    setGain: ReturnType<typeof vi.fn>;
  };
  let mediasoup: {
    setMicrophoneMuted: ReturnType<typeof vi.fn>;
  };
  let playMuteAudio: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.clear();
    Reflect.deleteProperty(Storage.prototype, 'getItemJson');
    Reflect.deleteProperty(Storage.prototype, 'setItemJson');

    playback = {
      detach: vi.fn(),
      detachAll: vi.fn(),
      applySpeakerMuted: vi.fn(),
      setPeerGain: vi.fn(),
    };
    screenAudio = {
      applySpeakerMuted: vi.fn(),
      setGain: vi.fn(),
    };
    mediasoup = {
      setMicrophoneMuted: vi.fn(),
    };
    playMuteAudio = vi.fn();

    TestBed.configureTestingModule({
      providers: [
        {
          provide: AudioService,
          useValue: { playMuteAudio },
        },
        {
          provide: PeerPlaybackService,
          useValue: playback,
        },
        {
          provide: PeerScreenAudioService,
          useValue: screenAudio,
        },
        {
          provide: MediasoupSessionService,
          useValue: mediasoup,
        },
      ],
    });
  });

  it('toggleMicrophoneMuted unmutes speaker when the mic is enabled', () => {
    const store = TestBed.inject(VoiceAudioPreferencesStore);
    store.setMicrophoneMuted(true);
    store.setSpeakerMuted(true);

    store.toggleMicrophoneMuted();

    expect(store.microphoneMuted()).toBe(false);
    expect(store.speakerMuted()).toBe(false);
    expect(playMuteAudio).toHaveBeenCalledTimes(1);
  });

  it('toggleSpeakerMuted mutes the microphone when deafened', () => {
    const store = TestBed.inject(VoiceAudioPreferencesStore);

    store.toggleSpeakerMuted();

    expect(store.speakerMuted()).toBe(true);
    expect(store.microphoneMuted()).toBe(true);
    expect(playMuteAudio).toHaveBeenCalledTimes(1);
  });

  it('persists mute flags and applies them to mediasoup and playback', () => {
    const store = TestBed.inject(VoiceAudioPreferencesStore);

    store.setMicrophoneMuted(true);
    store.setSpeakerMuted(true);
    TestBed.flushEffects();

    expect(mediasoup.setMicrophoneMuted).toHaveBeenCalledWith(true);
    expect(playback.applySpeakerMuted).toHaveBeenCalledWith(true, {});
    expect(screenAudio.applySpeakerMuted).toHaveBeenCalledWith(true, {});
    expect(
      JSON.parse(localStorage.getItem(EStorageKey.MICROPHONE_MUTED) ?? 'null'),
    ).toBe(true);
    expect(
      JSON.parse(localStorage.getItem(EStorageKey.SPEAKER_MUTED) ?? 'null'),
    ).toBe(true);
  });

  it('hydrates mute and peer gains before the storage prototype is patched', () => {
    localStorage.setItem('konvoez-microphone-muted', 'true');
    localStorage.setItem(
      'konvoez-peer-gain-levels',
      JSON.stringify({ 42: 0.25 }),
    );

    const store = TestBed.inject(VoiceAudioPreferencesStore);

    expect(store.microphoneMuted()).toBe(true);
    expect(store.peerGainLevels()[42]).toBe(0.25);

    TestBed.flushEffects();

    expect(localStorage.getItem('konvoez-microphone-muted')).toBe('true');
  });

  it('persists peer gains through effects after state changes', () => {
    const store = TestBed.inject(VoiceAudioPreferencesStore);

    store.setPeerGain(42, 1.5);
    store.setPeerScreenGain(42, 0.75);

    expect(store.peerGainLevels()[42]).toBe(1.5);
    expect(store.peerScreenGainLevels()[42]).toBe(0.75);
    expect(playback.setPeerGain).toHaveBeenCalledWith(42, 1.5, false);
    expect(screenAudio.setGain).toHaveBeenCalledWith(42, 0.75, false);

    TestBed.flushEffects();

    expect(
      JSON.parse(localStorage.getItem(EStorageKey.PEER_GAIN_LEVELS) ?? '{}'),
    ).toEqual({ 42: 1.5 });
    expect(
      JSON.parse(
        localStorage.getItem(EStorageKey.PEER_SCREEN_GAIN_LEVELS) ?? '{}',
      ),
    ).toEqual({ 42: 0.75 });
  });
});
