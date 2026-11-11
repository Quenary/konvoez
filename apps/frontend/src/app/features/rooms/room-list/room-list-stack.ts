const VOICE_ROOM_STACK_SIZE = 2;

export interface IVoiceRoomStack<T> {
  shown: T[];
  extra: number;
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
