import {
  IUser,
  TVoiceRoomPeerUser,
  TVoiceRoomGetAllPeersResult,
} from '@konvoez/shared';

export function toPeerUser(
  user: IUser & { producers?: unknown; muted?: boolean; deafened?: boolean },
): TVoiceRoomPeerUser {
  const { producers: _producers, ...rest } = user;
  return rest;
}

export function mapRoomsUser(
  rooms: TVoiceRoomGetAllPeersResult,
  user: IUser,
): TVoiceRoomGetAllPeersResult {
  let changed = false;
  const next: Record<number, Record<number, TVoiceRoomPeerUser>> = {};
  for (const [roomId, peers] of Object.entries(rooms)) {
    const roomPeers = peers;
    const existing = roomPeers[user.id];
    if (existing) {
      changed = true;
      next[Number(roomId)] = {
        ...roomPeers,
        [user.id]: {
          ...existing,
          ...user,
        },
      };
    } else {
      next[Number(roomId)] = roomPeers;
    }
  }
  return changed ? next : rooms;
}

export function omitRoomsUser(
  rooms: TVoiceRoomGetAllPeersResult,
  userId: number,
): TVoiceRoomGetAllPeersResult {
  let changed = false;
  const next: Record<number, Record<number, TVoiceRoomPeerUser>> = {};
  for (const [roomId, peers] of Object.entries(rooms)) {
    if (peers[userId]) {
      changed = true;
      const { [userId]: _removed, ...rest } = peers;
      next[Number(roomId)] = rest;
    } else {
      next[Number(roomId)] = peers;
    }
  }
  return changed ? next : rooms;
}
