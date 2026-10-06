import { describe, expect, it } from 'vitest';
import { IUser } from '@konvoez/shared';
import {
  buildVoiceRoomTiles,
  findVoiceRoomTile,
  resolveTheatreTile,
  showsRemoteScreenWatchControls,
} from './voice-room-tiles';

const user = (id: number): IUser => ({ id, username: `u${id}` }) as IUser;

const track = (id: string): MediaStreamTrack => ({ id }) as MediaStreamTrack;

const baseInput = (): Parameters<typeof buildVoiceRoomTiles>[0] => ({
  peers: [user(1), user(2)],
  localUserId: 1,
  localCamTrack: null,
  localScreenTrack: null,
  remoteCamTracks: {},
  remoteScreenTracks: {},
  availableScreens: {},
  watchingUserIds: new Set(),
});

describe('buildVoiceRoomTiles', () => {
  it('emits one voice-only tile per peer with no video', () => {
    const tiles = buildVoiceRoomTiles(baseInput());
    expect(tiles).toHaveLength(2);
    expect(tiles[0]).toMatchObject({
      key: '1:voice',
      streamKind: null,
      videoTrack: null,
    });
  });

  it('emits one cam tile when only camera is active', () => {
    const cam = track('cam');
    const tiles = buildVoiceRoomTiles({
      ...baseInput(),
      localCamTrack: cam,
    });
    expect(tiles.filter((t) => t.peerId === 1)).toEqual([
      expect.objectContaining({
        key: '1:cam',
        streamKind: 'cam',
        videoTrack: cam,
      }),
    ]);
  });

  it('emits one screen tile when only screen is active', () => {
    const screen = track('scr');
    const tiles = buildVoiceRoomTiles({
      ...baseInput(),
      localScreenTrack: screen,
    });
    expect(tiles.filter((t) => t.peerId === 1)).toEqual([
      expect.objectContaining({
        key: '1:screen',
        streamKind: 'screen',
        videoTrack: screen,
      }),
    ]);
  });

  it('emits cam and screen tiles when both are active', () => {
    const cam = track('cam');
    const screen = track('scr');
    const tiles = buildVoiceRoomTiles({
      ...baseInput(),
      localCamTrack: cam,
      localScreenTrack: screen,
    });
    const localTiles = tiles.filter((t) => t.peerId === 1);
    expect(localTiles).toHaveLength(2);
    expect(localTiles[0].streamKind).toBe('cam');
    expect(localTiles[1].streamKind).toBe('screen');
  });

  it('shows remote screen track only when watching', () => {
    const cam = track('cam');
    const screen = track('scr');
    const tiles = buildVoiceRoomTiles({
      ...baseInput(),
      remoteCamTracks: { 2: cam },
      remoteScreenTracks: { 2: screen },
      availableScreens: { 2: { videoProducerId: 'p1' } },
      watchingUserIds: new Set(),
    });
    const remoteTiles = tiles.filter((t) => t.peerId === 2);
    expect(remoteTiles).toHaveLength(2);
    expect(remoteTiles[1].videoTrack).toBeNull();

    const watching = buildVoiceRoomTiles({
      ...baseInput(),
      remoteCamTracks: { 2: cam },
      remoteScreenTracks: { 2: screen },
      availableScreens: { 2: { videoProducerId: 'p1' } },
      watchingUserIds: new Set([2]),
    });
    const screenTile = watching.find(
      (t) => t.peerId === 2 && t.streamKind === 'screen',
    );
    expect(screenTile?.videoTrack).toBe(screen);
  });

  it('creates two tiles when remote screen is live with cam', () => {
    const cam = track('cam');
    const tiles = buildVoiceRoomTiles({
      ...baseInput(),
      remoteCamTracks: { 2: cam },
      availableScreens: { 2: { videoProducerId: 'p1' } },
    });
    expect(tiles.filter((t) => t.peerId === 2)).toHaveLength(2);
  });
});

describe('findVoiceRoomTile', () => {
  it('finds a tile by peer and stream kind', () => {
    const tiles = buildVoiceRoomTiles({
      ...baseInput(),
      localCamTrack: track('cam'),
      localScreenTrack: track('scr'),
    });
    const found = findVoiceRoomTile(tiles, 1, 'screen');
    expect(found?.streamKind).toBe('screen');
  });
});

describe('resolveTheatreTile', () => {
  it('keeps the focused tile when it still exists without a video track', () => {
    const tiles = buildVoiceRoomTiles({
      ...baseInput(),
      availableScreens: { 2: { videoProducerId: 'p1' } },
    });
    const resolved = resolveTheatreTile(
      { peerId: 2, stream: 'screen' },
      tiles,
      1,
    );
    expect(resolved).toMatchObject({
      peerId: 2,
      streamKind: 'screen',
      videoTrack: null,
    });
  });

  it('falls back to the first remote tile with video', () => {
    const cam = track('cam');
    const tiles = buildVoiceRoomTiles({
      ...baseInput(),
      peers: [user(1), user(2), user(3)],
      remoteCamTracks: { 3: cam },
    });
    const resolved = resolveTheatreTile(
      { peerId: 9, stream: 'screen' },
      tiles,
      1,
    );
    expect(resolved).toMatchObject({
      peerId: 3,
      streamKind: 'cam',
      videoTrack: cam,
    });
  });

  it('falls back to a remote tile before the local one', () => {
    const tiles = buildVoiceRoomTiles(baseInput());
    const resolved = resolveTheatreTile({ peerId: 9, stream: 'cam' }, tiles, 1);
    expect(resolved?.peerId).toBe(2);
    expect(resolved?.streamKind).toBeNull();
  });

  it('uses the remaining tile when nobody else is in the room', () => {
    const tiles = buildVoiceRoomTiles({
      ...baseInput(),
      peers: [user(1)],
    });
    const resolved = resolveTheatreTile({ peerId: 9, stream: null }, tiles, 1);
    expect(resolved?.peerId).toBe(1);
  });

  it('returns null when theatre is closed or there are no tiles', () => {
    expect(
      resolveTheatreTile(null, buildVoiceRoomTiles(baseInput()), 1),
    ).toBeNull();
    expect(resolveTheatreTile({ peerId: 1, stream: null }, [], 1)).toBeNull();
  });
});

describe('showsRemoteScreenWatchControls', () => {
  it('is true only while a remote screen is being watched', () => {
    expect(
      showsRemoteScreenWatchControls(
        { peerId: 2, stream: 'screen' },
        1,
        new Set([2]),
      ),
    ).toBe(true);
    expect(
      showsRemoteScreenWatchControls(
        { peerId: 2, stream: 'screen' },
        1,
        new Set(),
      ),
    ).toBe(false);
    expect(
      showsRemoteScreenWatchControls(
        { peerId: 1, stream: 'screen' },
        1,
        new Set([1]),
      ),
    ).toBe(false);
    expect(
      showsRemoteScreenWatchControls(
        { peerId: 2, stream: 'cam' },
        1,
        new Set([2]),
      ),
    ).toBe(false);
  });
});
