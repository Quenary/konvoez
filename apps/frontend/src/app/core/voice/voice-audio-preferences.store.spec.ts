import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Store } from '@ngrx/store';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EUserRole, EVoiceSessionType, IUser } from '@konvoez/shared';
import { EStorageKey } from '../../app.enums';
import { AudioActivityService } from '@core/services/audio-activity.service';
import { AudioService } from '@core/services/audio.service';
import { MediasoupSessionService } from '@core/services/mediasoup-session.service';
import { MicrophoneService } from '@core/services/microphone.service';
import { PeerPlaybackService } from '@core/services/peer-playback.service';
import { PeerScreenAudioService } from '@core/services/peer-screen-audio.service';
import { VoiceAudioPreferencesStore } from './voice-audio-preferences.store';
import { VoiceSessionStore } from './voice-session.store';

const bob = {
  id: 42,
  username: 'bob',
  fullname: 'Bob',
  email: 'bob@example.com',
  avatarUrl: null,
  role: EUserRole.MEMBER,
  createdAt: new Date(),
  updatedAt: new Date(),
} as IUser;

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
  let currentUser: ReturnType<typeof signal<IUser | null>>;
  let analyserNode: ReturnType<typeof signal<AnalyserNode | null>>;
  let audioActivity: {
    register: ReturnType<typeof vi.fn>;
    unregister: ReturnType<typeof vi.fn>;
  };
  let playMuteAudio: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.clear();
    Reflect.deleteProperty(Storage.prototype, 'getItemJson');
    Reflect.deleteProperty(Storage.prototype, 'setItemJson');

    currentUser = signal(null);
    analyserNode = signal(null);
    audioActivity = {
      register: vi.fn(),
      unregister: vi.fn(),
    };

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
        {
          provide: MicrophoneService,
          useValue: {
            analyserNode,
          },
        },
        {
          provide: AudioActivityService,
          useValue: audioActivity,
        },
        {
          provide: Store,
          useValue: {
            selectSignal: () => currentUser,
          },
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

  it('unregisters the previous user when the current user is cleared', () => {
    const sessionStore = TestBed.inject(VoiceSessionStore);
    const store = TestBed.inject(VoiceAudioPreferencesStore);
    const node = {} as AnalyserNode;
    sessionStore.setActiveSession({
      type: EVoiceSessionType.GROUP_ROOM,
      roomId: 1,
    });
    currentUser.set(bob);
    analyserNode.set(node);
    TestBed.flushEffects();

    expect(audioActivity.register).toHaveBeenCalledWith(bob.id, node);

    currentUser.set(null);
    TestBed.flushEffects();

    expect(audioActivity.unregister).toHaveBeenCalledWith(bob.id);
    expect(store.microphoneMuted()).toBe(false);
  });
});
