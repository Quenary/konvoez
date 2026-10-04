import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Store } from '@ngrx/store';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EUserRole, EVoiceSessionType, IUser } from '@konvoez/shared';
import { storageJson } from '../../../extentions/local-storage-json';
import { EStorageKey } from '../../app.enums';
import { AudioActivityService } from '@core/services/audio-activity.service';
import { MediasoupSessionService } from '@core/services/mediasoup-session.service';
import { MicrophoneService } from '@core/services/microphone.service';
import { PeerPlaybackService } from '@core/services/peer-playback.service';
import { VoiceRoomStore } from './voice-room.store';

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

describe('VoiceRoomStore', () => {
  let playback: {
    detach: ReturnType<typeof vi.fn>;
    detachAll: ReturnType<typeof vi.fn>;
    applySpeakerMuted: ReturnType<typeof vi.fn>;
    setPeerGain: ReturnType<typeof vi.fn>;
  };
  let mediasoup: {
    setMicrophoneMuted: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    localStorage.clear();
    storageJson();

    playback = {
      detach: vi.fn(),
      detachAll: vi.fn(),
      applySpeakerMuted: vi.fn(),
      setPeerGain: vi.fn(),
    };
    mediasoup = {
      setMicrophoneMuted: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        {
          provide: PeerPlaybackService,
          useValue: playback,
        },
        {
          provide: MediasoupSessionService,
          useValue: mediasoup,
        },
        {
          provide: MicrophoneService,
          useValue: {
            analyserNode: signal(null),
          },
        },
        {
          provide: AudioActivityService,
          useValue: {
            register: vi.fn(),
            unregister: vi.fn(),
          },
        },
        {
          provide: Store,
          useValue: {
            selectSignal: () => signal(null),
          },
        },
      ],
    });
  });

  it('persists mute flags and applies them to mediasoup and playback', () => {
    const store = TestBed.inject(VoiceRoomStore);

    store.setMicrophoneMuted(true);
    store.setSpeakerMuted(true);
    TestBed.flushEffects();

    expect(mediasoup.setMicrophoneMuted).toHaveBeenCalledWith(true);
    expect(playback.applySpeakerMuted).toHaveBeenCalledWith(true, {});
    expect(localStorage.getItemJson(EStorageKey.MICROPHONE_MUTED)).toBe(true);
    expect(localStorage.getItemJson(EStorageKey.SPEAKER_MUTED)).toBe(true);
  });

  it('updates lobby peers when a user entity changes', () => {
    const store = TestBed.inject(VoiceRoomStore);
    store.setRoomsState({ 1: { [bob.id]: bob } });

    store.applyUserEntityUpdate({ ...bob, fullname: 'Robert' });

    expect(store.roomsState()[1]?.[bob.id]?.fullname).toBe('Robert');
  });

  it('removes a deleted user from the lobby and session', () => {
    const store = TestBed.inject(VoiceRoomStore);
    store.setPeers([bob]);
    store.setRoomsState({ 1: { [bob.id]: bob } });

    store.applyUserEntityDeleted(bob.id);

    expect(playback.detach).toHaveBeenCalledWith(bob.id);
    expect(store.peersDict()[bob.id]).toBeUndefined();
    expect(store.roomsState()[1]?.[bob.id]).toBeUndefined();
  });

  it('computes selectedRoomId only for group sessions', () => {
    const store = TestBed.inject(VoiceRoomStore);
    store.setActiveSession({
      type: EVoiceSessionType.GROUP_ROOM,
      roomId: 9,
    });
    expect(store.selectedRoomId()).toBe(9);

    store.setActiveSession({
      type: EVoiceSessionType.DIRECT_CALL,
      callId: 'c1',
      interlocutorId: bob.id,
    });
    expect(store.selectedRoomId()).toBeNull();
    expect(store.directCallTarget()?.callId).toBe('c1');
  });
});
