import { IRoom, TVoiceRoomPeerUser } from '@konvoez/shared';

export const VOICE_ROOM_STACK_SIZE = 2;

export interface IVoiceRoomRow extends IRoom {
  peers: TVoiceRoomPeerUser[];
  isUserInRoom: boolean;
}

export interface IVoiceRoomStack<T> {
  shown: T[];
  extra: number;
}

export function buildVoiceRoomRows(
  rooms: readonly IRoom[],
  roomsState: Readonly<
    Record<number, Readonly<Record<number, TVoiceRoomPeerUser>> | undefined>
  >,
  currentUserId: number | undefined,
): IVoiceRoomRow[] {
  return rooms.map((room) => {
    const peers = Object.values(roomsState[room.id] ?? {});
    return {
      ...room,
      peers,
      isUserInRoom: peers.some((peer) => peer.id === currentUserId),
    };
  });
}

export function voiceRoomStack<T>(peers: readonly T[]): IVoiceRoomStack<T> {
  const shown = peers.slice(0, VOICE_ROOM_STACK_SIZE);
  return {
    shown,
    extra: Math.max(peers.length - shown.length, 0),
  };
}

export function formatVoiceStackExtra(extra: number): string {
  return extra > 99 ? '99+' : `+${extra}`;
}
