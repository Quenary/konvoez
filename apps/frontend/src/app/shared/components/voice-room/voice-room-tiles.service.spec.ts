import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Store } from '@ngrx/store';
import { EVoiceSessionType, IUser } from '@konvoez/shared';
import { PeerVideoService } from '@core/services/peer-video.service';
import { LocalScreenPreviewService } from '@core/services/local-screen-preview.service';
import { VoiceSessionStore } from '@core/voice/voice-session.store';
import { describe, expect, it, beforeEach } from 'vitest';
import { VoiceRoomTilesService } from './voice-room-tiles.service';
import { VoiceRoomViewService } from './voice-room-view.service';
import { VoiceSessionPeersService } from './voice-session-peers.service';

const user = (id: number): IUser =>
  ({ id, username: `u${id}`, fullname: `User ${id}` }) as IUser;

describe('VoiceRoomTilesService', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        VoiceRoomViewService,
        VoiceRoomTilesService,
        {
          provide: LocalScreenPreviewService,
          useValue: { paused: signal(false).asReadonly() },
        },
        {
          provide: Store,
          useValue: { selectSignal: () => signal(user(1)).asReadonly() },
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
          provide: VoiceSessionPeersService,
          useValue: { peers: signal([user(1), user(2)]).asReadonly() },
        },
        {
          provide: PeerVideoService,
          useValue: {
            localCamTrack: signal(null).asReadonly(),
            localScreenTrack: signal(null).asReadonly(),
            remoteCamTracks: signal({}).asReadonly(),
            remoteScreenTracks: signal({}).asReadonly(),
            availableScreens: signal({}).asReadonly(),
            watchingUserIds: signal(new Set<number>()).asReadonly(),
          },
        },
      ],
    });
  });

  it('builds a tile per peer', () => {
    const tiles = TestBed.inject(VoiceRoomTilesService).tiles();
    expect(tiles.map((tile) => tile.peerId)).toEqual([1, 2]);
  });

  it('exposes the stage tile only while theatre is active', () => {
    const view = TestBed.inject(VoiceRoomViewService);
    const service = TestBed.inject(VoiceRoomTilesService);

    expect(service.theatreTile()).toBeNull();

    view.openTheatre(2, null);
    expect(service.theatreTile()?.peerId).toBe(2);

    view.showGrid();
    expect(service.theatreTile()).toBeNull();
    expect(view.theatreFocus()).toEqual({ peerId: 2, stream: null });

    view.openTheatre(2, null);
    expect(service.theatreTile()?.peerId).toBe(2);
  });
});
