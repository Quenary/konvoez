import { EVoiceSessionType, IUser, TVoiceSessionTarget } from '@konvoez/shared';

export type TResolveVoiceSessionPeersInput = {
  me: IUser | null | undefined;
  remotePeers: readonly IUser[];
  session: TVoiceSessionTarget | null;
  isRinging: boolean;
  interlocutor: IUser | null;
};

/**
 * Builds the participant list for voice UI.
 * Media sessions use real peers only; ringing may include an interlocutor placeholder.
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
    return list;
  }

  if (input.isRinging && input.interlocutor) {
    const interlocutor = input.interlocutor;
    if (!list.some((existing) => existing.id === interlocutor.id)) {
      list.push(interlocutor);
    }
  }

  return list;
}
