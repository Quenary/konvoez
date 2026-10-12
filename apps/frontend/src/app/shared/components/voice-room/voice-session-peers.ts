import { EVoiceSessionType, IUser, TVoiceSessionTarget } from '@konvoez/shared';

export type TResolveVoiceSessionPeersInput = {
  me: IUser | null | undefined;
  remotePeers: readonly IUser[];
  session: TVoiceSessionTarget | null;
};

/**
 * Builds the participant list for voice UI from the active media session only.
 */
export function resolveVoiceSessionPeers(
  input: TResolveVoiceSessionPeersInput,
): IUser[] {
  const list: IUser[] = [];

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
