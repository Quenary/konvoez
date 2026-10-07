import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideTranslateService } from '@ngx-translate/core';
import { Store } from '@ngrx/store';
import { EVoiceSessionType, IUser } from '@konvoez/shared';
import { TuiNotificationService } from '@taiga-ui/core';
import { VoiceSessionService } from '@core/services/voice-session.service';
import { VoiceSessionStore } from '@core/voice/voice-session.store';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VoiceRoomActionsService } from './voice-room-actions.service';
import { VoiceRoomTilesService } from './voice-room-tiles.service';
import { VoiceRoomViewService } from './voice-room-view.service';
import type { TVoiceRoomTile } from './voice-room-tiles';

const user = (id: number): IUser =>
  ({ id, username: `u${id}`, fullname: `User ${id}` }) as IUser;

const tile = (
  peerId: number,
  streamKind: 'cam' | 'screen' | null,
  videoTrack: MediaStreamTrack | null = null,
): TVoiceRoomTile => ({
  key: `${peerId}:${streamKind ?? 'voice'}`,
  peer: user(peerId),
  peerId,
  streamKind,
  videoTrack,
  screenAvailable: false,
  watchingScreen: false,
});

describe('VoiceRoomActionsService', () => {
  let tiles: ReturnType<typeof signal<TVoiceRoomTile[]>>;
  let watchPeerScreen: ReturnType<typeof vi.fn>;
  let stopWatchingPeerScreen: ReturnType<typeof vi.fn>;
  let notificationOpen: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    tiles = signal([tile(1, null), tile(2, null)]);
    watchPeerScreen = vi.fn().mockResolvedValue(undefined);
    stopWatchingPeerScreen = vi.fn().mockResolvedValue(undefined);
    notificationOpen = vi.fn(() => of(null));

    TestBed.configureTestingModule({
      providers: [
        provideTranslateService(),
        VoiceRoomViewService,
        VoiceRoomActionsService,
        {
          provide: Store,
          useValue: {
            selectSignal: () => signal(user(1)).asReadonly(),
          },
        },
        {
          provide: VoiceSessionStore,
          useValue: {
            activeSession: signal({
              type: EVoiceSessionType.GROUP_ROOM,
              roomId: 1,
            }).asReadonly(),
          },
        },
        {
          provide: VoiceSessionService,
          useValue: { watchPeerScreen, stopWatchingPeerScreen },
        },
        {
          provide: TuiNotificationService,
          useValue: { open: notificationOpen },
        },
        {
          provide: VoiceRoomTilesService,
          useValue: { tiles: tiles.asReadonly() },
        },
      ],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const actions = () => TestBed.inject(VoiceRoomActionsService);
  const view = () => TestBed.inject(VoiceRoomViewService);

  describe('toggleLayout', () => {
    it('opens theatre on a default remote tile when nothing was focused', () => {
      actions().toggleLayout();

      expect(view().layout()).toBe('theatre');
      expect(view().theatreFocus()).toEqual({ peerId: 2, stream: null });
    });

    it('returns to grid and keeps the focus', () => {
      view().openTheatre(2, 'cam');

      actions().toggleLayout();

      expect(view().layout()).toBe('grid');
      expect(view().theatreFocus()).toEqual({ peerId: 2, stream: 'cam' });
    });

    it('reopens theatre on the remembered tile instead of the default one', () => {
      view().openTheatre(1, null);
      view().showGrid();

      actions().toggleLayout();

      expect(view().layout()).toBe('theatre');
      expect(view().theatreFocus()).toEqual({ peerId: 1, stream: null });
    });

    it('stays in grid when there is no tile to show', () => {
      tiles.set([]);

      actions().toggleLayout();

      expect(view().layout()).toBe('grid');
      expect(view().theatreFocus()).toBeNull();
    });
  });

  describe('screen watching', () => {
    it('delegates watch and stop to the voice session', async () => {
      await actions().watchPeerScreen(2);
      await actions().stopWatchingPeerScreen(2);

      expect(watchPeerScreen).toHaveBeenCalledWith(2);
      expect(stopWatchingPeerScreen).toHaveBeenCalledWith(2);
    });

    it('notifies the user when watching fails', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {
        /* noop */
      });
      watchPeerScreen.mockRejectedValue(new Error('boom'));

      await actions().watchPeerScreen(2);

      expect(notificationOpen).toHaveBeenCalledTimes(1);
    });
  });
});
