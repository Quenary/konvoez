import { IUser } from '@konvoez/shared';

export type TVoiceStreamKind = 'cam' | 'screen';

export type TVoicePeerTile = {
  key: string;
  peer: IUser;
  peerId: number;
  streamKind: TVoiceStreamKind | null;
  videoTrack: MediaStreamTrack | null;
  screenAvailable: boolean;
  watchingScreen: boolean;
};

export type TBuildVoicePeerTilesInput = {
  peers: readonly IUser[];
  localUserId: number | null;
  localCamTrack: MediaStreamTrack | null;
  localScreenTrack: MediaStreamTrack | null;
  remoteCamTracks: Readonly<Record<number, MediaStreamTrack>>;
  remoteScreenTracks: Readonly<Record<number, MediaStreamTrack>>;
  availableScreens: Readonly<
    Record<number, { videoProducerId: string; audioProducerId?: string }>
  >;
  watchingUserIds: ReadonlySet<number>;
};

const voiceTile = (
  peer: IUser,
  streamKind: TVoiceStreamKind | null,
  videoTrack: MediaStreamTrack | null,
  screenAvailable: boolean,
  watchingScreen: boolean,
): TVoicePeerTile => {
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
  input: TBuildVoicePeerTilesInput,
  peerId: number,
  isLocal: boolean,
): boolean => {
  if (isLocal) {
    return input.localScreenTrack !== null;
  }
  const available = input.availableScreens[peerId];
  return Boolean(available?.videoProducerId);
};

export function buildVoicePeerTiles(
  input: TBuildVoicePeerTilesInput,
): TVoicePeerTile[] {
  const tiles: TVoicePeerTile[] = [];

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
    const hasScreenSource = screenLive;

    if (!hasCam && !hasScreenSource) {
      tiles.push(voiceTile(peer, null, null, false, watchingScreen));
      continue;
    }

    if (hasCam && hasScreenSource) {
      tiles.push(voiceTile(peer, 'cam', camTrack, screenLive, watchingScreen));
      tiles.push(
        voiceTile(peer, 'screen', screenTrack, screenLive, watchingScreen),
      );
      continue;
    }

    if (hasCam) {
      tiles.push(voiceTile(peer, 'cam', camTrack, false, watchingScreen));
      continue;
    }

    tiles.push(
      voiceTile(peer, 'screen', screenTrack, screenLive, watchingScreen),
    );
  }

  return tiles;
}

export function findVoicePeerTile(
  tiles: readonly TVoicePeerTile[],
  peerId: number,
  stream: TVoiceStreamKind,
): TVoicePeerTile | null {
  return (
    tiles.find(
      (tile) => tile.peerId === peerId && tile.streamKind === stream,
    ) ?? null
  );
}
