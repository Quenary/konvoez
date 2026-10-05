import { describe, expect, it } from 'vitest';
import { IUser } from '@konvoez/shared';
import { buildVoicePeerTiles, findVoicePeerTile } from './voice-peer-tiles';

const user = (id: number): IUser => ({ id, username: `u${id}` }) as IUser;

const track = (id: string): MediaStreamTrack => ({ id }) as MediaStreamTrack;

const baseInput = (): Parameters<typeof buildVoicePeerTiles>[0] => ({
  peers: [user(1), user(2)],
  localUserId: 1,
  localCamTrack: null,
  localScreenTrack: null,
  remoteCamTracks: {},
  remoteScreenTracks: {},
  availableScreens: {},
  watchingUserIds: new Set(),
});

describe('buildVoicePeerTiles', () => {
  it('emits one voice-only tile per peer with no video', () => {
    const tiles = buildVoicePeerTiles(baseInput());
    expect(tiles).toHaveLength(2);
    expect(tiles[0]).toMatchObject({
      key: '1:voice',
      streamKind: null,
      videoTrack: null,
    });
  });

  it('emits one cam tile when only camera is active', () => {
    const cam = track('cam');
    const tiles = buildVoicePeerTiles({
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
    const tiles = buildVoicePeerTiles({
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
    const tiles = buildVoicePeerTiles({
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
    const tiles = buildVoicePeerTiles({
      ...baseInput(),
      remoteCamTracks: { 2: cam },
      remoteScreenTracks: { 2: screen },
      availableScreens: { 2: { videoProducerId: 'p1' } },
      watchingUserIds: new Set(),
    });
    const remoteTiles = tiles.filter((t) => t.peerId === 2);
    expect(remoteTiles).toHaveLength(2);
    expect(remoteTiles[1].videoTrack).toBeNull();

    const watching = buildVoicePeerTiles({
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
    const tiles = buildVoicePeerTiles({
      ...baseInput(),
      remoteCamTracks: { 2: cam },
      availableScreens: { 2: { videoProducerId: 'p1' } },
    });
    expect(tiles.filter((t) => t.peerId === 2)).toHaveLength(2);
  });
});

describe('findVoicePeerTile', () => {
  it('finds a tile by peer and stream kind', () => {
    const tiles = buildVoicePeerTiles({
      ...baseInput(),
      localCamTrack: track('cam'),
      localScreenTrack: track('scr'),
    });
    const found = findVoicePeerTile(tiles, 1, 'screen');
    expect(found?.streamKind).toBe('screen');
  });
});
