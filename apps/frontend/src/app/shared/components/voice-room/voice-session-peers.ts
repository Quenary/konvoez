import {
  EVoiceSessionType,
  IUserSafe,
  TVoiceRoomPeerUser,
  TVoiceSessionTarget,
} from '@konvoez/shared';

export type TResolveVoiceSessionPeersInput = {
  me: IUserSafe | null | undefined;
  remotePeers: readonly TVoiceRoomPeerUser[];
  session: TVoiceSessionTarget | null;
};

/**
 * Builds the participant list for voice UI from the active media session only.
 */
export function resolveVoiceSessionPeers(
  input: TResolveVoiceSessionPeersInput,
): TVoiceRoomPeerUser[] {
  const list: TVoiceRoomPeerUser[] = [];

  if (input.me) {
    list.push(input.me);
  }

  if (
    input.session?.type === EVoiceSessionType.DIRECT_CALL ||
    input.session?.type === EVoiceSessionType.GROUP_ROOM
  ) {
    for (const peer of input.remotePeers) {
      if (!list.some((existing) => existing.id === peer.id)) {
        list.push(peer);
      }
    }
  }

  return list;
}
