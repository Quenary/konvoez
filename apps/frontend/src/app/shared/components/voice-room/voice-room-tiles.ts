import { IUser } from '@konvoez/shared';
import type { TAvailableScreenShare } from '@core/services/peer-video.service';

export type TVoiceStreamKind = 'cam' | 'screen';

export type TVoiceRoomTile = {
  key: string;
  peer: IUser;
  peerId: number;
  streamKind: TVoiceStreamKind | null;
  videoTrack: MediaStreamTrack | null;
  screenAvailable: boolean;
  watchingScreen: boolean;
};

export type TBuildVoiceRoomTilesInput = {
  peers: readonly IUser[];
  localUserId: number | null;
  localCamTrack: MediaStreamTrack | null;
  localScreenTrack: MediaStreamTrack | null;
  remoteCamTracks: Readonly<Record<number, MediaStreamTrack>>;
  remoteScreenTracks: Readonly<Record<number, MediaStreamTrack>>;
  availableScreens: Readonly<Record<number, TAvailableScreenShare>>;
  watchingUserIds: ReadonlySet<number>;
};

const voiceTile = (
  peer: IUser,
  streamKind: TVoiceStreamKind | null,
  videoTrack: MediaStreamTrack | null,
  screenAvailable: boolean,
  watchingScreen: boolean,
): TVoiceRoomTile => {
  const kindKey = streamKind ?? 'voice';
  return {
    key: `${peer.id}:${kindKey}`,
    peer,
    peerId: peer.id,
    streamKind,
    videoTrack,
    screenAvailable,
    watchingScreen,
  };
};

const screenAvailableForPeer = (
  input: TBuildVoiceRoomTilesInput,
  peerId: number,
  isLocal: boolean,
): boolean => {
  if (isLocal) {
    return input.localScreenTrack !== null;
  }
  const available = input.availableScreens[peerId];
  return Boolean(available?.videoProducerId);
};

export function buildVoiceRoomTiles(
  input: TBuildVoiceRoomTilesInput,
): TVoiceRoomTile[] {
  const tiles: TVoiceRoomTile[] = [];

  for (const peer of input.peers) {
    const isLocal = input.localUserId !== null && peer.id === input.localUserId;
    const camTrack = isLocal
      ? input.localCamTrack
      : (input.remoteCamTracks[peer.id] ?? null);
    const hasCam = camTrack !== null;
    const screenLive = screenAvailableForPeer(input, peer.id, isLocal);
    const watchingScreen = input.watchingUserIds.has(peer.id);
    const screenTrack = isLocal
      ? input.localScreenTrack
      : watchingScreen
        ? (input.remoteScreenTracks[peer.id] ?? null)
        : null;
    if (!hasCam && !screenLive) {
      tiles.push(voiceTile(peer, null, null, false, watchingScreen));
      continue;
    }

    if (hasCam && screenLive) {
      tiles.push(voiceTile(peer, 'cam', camTrack, screenLive, watchingScreen));
      tiles.push(
        voiceTile(peer, 'screen', screenTrack, screenLive, watchingScreen),
      );
      continue;
    }

    if (hasCam) {
      tiles.push(voiceTile(peer, 'cam', camTrack, screenLive, watchingScreen));
      continue;
    }

    tiles.push(
      voiceTile(peer, 'screen', screenTrack, screenLive, watchingScreen),
    );
  }

  return tiles;
}

export function findVoiceRoomTile(
  tiles: readonly TVoiceRoomTile[],
  peerId: number,
  stream: TVoiceStreamKind | null,
): TVoiceRoomTile | null {
  return (
    tiles.find(
      (tile) => tile.peerId === peerId && tile.streamKind === stream,
    ) ?? null
  );
}

const isRemoteTile = (
  tile: TVoiceRoomTile,
  localUserId: number | null,
): boolean => localUserId == null || tile.peerId !== localUserId;

/**
 * Theatre display target. Keeps the focused tile when it still exists.
 * When that stream is gone, switches to an active remote stream: a watched
 * screen first, then any other remote tile that has video. A regular tile
 * is used only when nothing is streaming, and a remote one comes before
 * yourself. Returns null only when the room has no tiles; the caller keeps
 * theatre open. This does not change the stored focus.
 */
export function resolveTheatreTile(
  focus: { peerId: number; stream: TVoiceStreamKind | null } | null,
  tiles: readonly TVoiceRoomTile[],
  localUserId: number | null,
): TVoiceRoomTile | null {
  if (focus == null) {
    return null;
  }
  const exact = findVoiceRoomTile(tiles, focus.peerId, focus.stream);
  if (exact) {
    return exact;
  }
  const watchedScreen = tiles.find(
    (tile) =>
      isRemoteTile(tile, localUserId) &&
      tile.streamKind === 'screen' &&
      tile.watchingScreen &&
      tile.videoTrack != null,
  );
  if (watchedScreen) {
    return watchedScreen;
  }
  const remoteWithVideo = tiles.find(
    (tile) => isRemoteTile(tile, localUserId) && tile.videoTrack != null,
  );
  if (remoteWithVideo) {
    return remoteWithVideo;
  }
  const remote = tiles.find((tile) => isRemoteTile(tile, localUserId));
  if (remote) {
    return remote;
  }
  return tiles[0] ?? null;
}

export function showsRemoteScreenWatchControls(
  focus: { peerId: number; stream: TVoiceStreamKind | null } | null,
  localUserId: number | null,
  watchingUserIds: ReadonlySet<number>,
): boolean {
  if (focus == null || focus.stream !== 'screen') {
    return false;
  }
  if (localUserId != null && focus.peerId === localUserId) {
    return false;
  }
  return watchingUserIds.has(focus.peerId);
}
