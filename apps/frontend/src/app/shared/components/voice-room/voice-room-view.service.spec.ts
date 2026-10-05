import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Store } from '@ngrx/store';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DirectCallService } from '@core/services/direct-call.service';
import { PeerVideoService } from '@core/services/peer-video.service';
import { VoiceSessionService } from '@core/services/voice-session.service';
import { VoiceRoomStore } from '@features/voice-room/voice-room.store';
import { IUser } from '@konvoez/shared';
import { VoiceRoomViewService } from './voice-room-view.service';

const user = (id: number): IUser => ({ id, username: `u${id}` }) as IUser;

describe('VoiceRoomViewService', () => {
  let currentUser: ReturnType<typeof signal<IUser | null>>;
  let remotePeers: ReturnType<typeof signal<readonly IUser[]>>;
  let watchingUserIds: ReturnType<typeof signal<ReadonlySet<number>>>;
  let interlocutor: ReturnType<typeof signal<IUser | null>>;
  let stopWatchingPeerScreen: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    currentUser = signal(user(1));
    remotePeers = signal([user(2), user(3)]);
    watchingUserIds = signal(new Set([2]));
    interlocutor = signal(null);
    stopWatchingPeerScreen = vi.fn().mockResolvedValue(undefined);

    TestBed.configureTestingModule({
      providers: [
        VoiceRoomViewService,
        {
          provide: Store,
          useValue: {
            selectSignal: () => currentUser.asReadonly(),
          },
        },
        {
          provide: VoiceRoomStore,
          useValue: {
            peersList: remotePeers.asReadonly(),
          },
        },
        {
          provide: PeerVideoService,
          useValue: {
            watchingUserIds: watchingUserIds.asReadonly(),
          },
        },
        {
          provide: VoiceSessionService,
          useValue: { stopWatchingPeerScreen },
        },
        {
          provide: DirectCallService,
          useValue: {
            interlocutor: interlocutor.asReadonly(),
          },
        },
      ],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('opens theatre for a watched remote peer and ignores the local user', () => {
    const view = TestBed.inject(VoiceRoomViewService);
    view.openTheatre(1);
    expect(view.theatreFocusId()).toBeNull();

    view.openTheatre(2);
    expect(view.theatreFocusId()).toBe(2);
    expect(view.theatreOpen()).toBe(true);
  });

  it('does not open theatre for a peer that is not being watched', () => {
    const view = TestBed.inject(VoiceRoomViewService);
    view.openTheatre(3);
    expect(view.theatreOpen()).toBe(false);
  });

  it('closes theatre when the focused peer is no longer watched', () => {
    const view = TestBed.inject(VoiceRoomViewService);
    view.openTheatre(2);
    expect(view.theatreOpen()).toBe(true);

    watchingUserIds.set(new Set());
    TestBed.flushEffects();
    expect(view.theatreOpen()).toBe(false);
  });

  it('closes theatre on Escape when not fullscreen', () => {
    const view = TestBed.inject(VoiceRoomViewService);
    view.openTheatre(2);
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    expect(view.theatreOpen()).toBe(false);
  });

  it('stops watching the focused peer', async () => {
    const view = TestBed.inject(VoiceRoomViewService);
    view.openTheatre(2);
    await view.stopWatchingFocus();
    expect(stopWatchingPeerScreen).toHaveBeenCalledWith(2);
  });

  it('fullscreens the attached host without closing theatre', async () => {
    const view = TestBed.inject(VoiceRoomViewService);
    view.openTheatre(2);
    const host = document.createElement('div');
    const requestFullscreen = vi.fn().mockResolvedValue(undefined);
    host.requestFullscreen = requestFullscreen;
    view.attachHost(host);

    await view.toggleFullscreen();

    expect(requestFullscreen).toHaveBeenCalledTimes(1);
    expect(view.theatreOpen()).toBe(true);

    view.closeTheatre();
    expect(view.theatreOpen()).toBe(false);
  });

  it('does not exit fullscreen when closing theatre', () => {
    const view = TestBed.inject(VoiceRoomViewService);
    const exitFullscreen = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(document, 'exitFullscreen', {
      configurable: true,
      value: exitFullscreen,
    });
    view.openTheatre(2);
    view.closeTheatre();
    expect(exitFullscreen).not.toHaveBeenCalled();
  });
});
