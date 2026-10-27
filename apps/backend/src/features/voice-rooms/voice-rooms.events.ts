import type {
  TVoiceRoomLobbyPeerJoined,
  TVoiceRoomLobbyPeerLeft,
  TVoiceRoomLobbyPeerMuted,
} from '@konvoez/shared';
import { createDomainEventEmitter } from '@shared/events';

export const VoiceRoomsDomainEvents = {
  VOICE_ROOM_PEER_JOINED: 'voice-room.peer-joined',
  VOICE_ROOM_PEER_LEFT: 'voice-room.peer-left',
  VOICE_ROOM_PEER_MUTED: 'voice-room.peer-muted',
  DIRECT_CALL_INCOMING: 'voice-room.direct-call-incoming',
} as const;

export type TVoiceRoomsDomainEvent =
  (typeof VoiceRoomsDomainEvents)[keyof typeof VoiceRoomsDomainEvents];

export type TVoiceRoomDirectCallIncomingPayload = {
  recipientId: number;
  callerId: number;
  callerUsername: string;
  callId: string;
};

export type TVoiceRoomsDomainPayloadMap = {
  [VoiceRoomsDomainEvents.VOICE_ROOM_PEER_JOINED]: TVoiceRoomLobbyPeerJoined;
  [VoiceRoomsDomainEvents.VOICE_ROOM_PEER_LEFT]: TVoiceRoomLobbyPeerLeft;
  [VoiceRoomsDomainEvents.VOICE_ROOM_PEER_MUTED]: TVoiceRoomLobbyPeerMuted;
  [VoiceRoomsDomainEvents.DIRECT_CALL_INCOMING]: TVoiceRoomDirectCallIncomingPayload;
};

export const emitVoiceRoomsDomainEvent =
  createDomainEventEmitter<TVoiceRoomsDomainPayloadMap>();
