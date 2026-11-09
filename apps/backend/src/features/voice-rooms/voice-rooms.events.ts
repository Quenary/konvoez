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
  DIRECT_CALL_ENDED: 'voice-room.direct-call-ended',
  VOICE_ROOM_GUEST_ENTERED: 'voice-room.guest-entered',
  VOICE_ROOM_GUEST_LEFT: 'voice-room.guest-left',
} as const;

export type TVoiceRoomsDomainEvent =
  (typeof VoiceRoomsDomainEvents)[keyof typeof VoiceRoomsDomainEvents];

export type TVoiceRoomDirectCallIncomingPayload = {
  recipientId: number;
  callerId: number;
  callerUsername: string;
  callId: string;
};

export type TVoiceRoomDirectCallEndedPayload = {
  recipientId: number;
  callerId: number;
  callId: string;
};

export type TVoiceRoomGuestPayload = {
  userId: number;
  roomId: number;
};

export type TVoiceRoomsDomainPayloadMap = {
  [VoiceRoomsDomainEvents.VOICE_ROOM_PEER_JOINED]: TVoiceRoomLobbyPeerJoined;
  [VoiceRoomsDomainEvents.VOICE_ROOM_PEER_LEFT]: TVoiceRoomLobbyPeerLeft;
  [VoiceRoomsDomainEvents.VOICE_ROOM_PEER_MUTED]: TVoiceRoomLobbyPeerMuted;
  [VoiceRoomsDomainEvents.DIRECT_CALL_INCOMING]: TVoiceRoomDirectCallIncomingPayload;
  [VoiceRoomsDomainEvents.DIRECT_CALL_ENDED]: TVoiceRoomDirectCallEndedPayload;
  [VoiceRoomsDomainEvents.VOICE_ROOM_GUEST_ENTERED]: TVoiceRoomGuestPayload;
  [VoiceRoomsDomainEvents.VOICE_ROOM_GUEST_LEFT]: TVoiceRoomGuestPayload;
};

export const emitVoiceRoomsDomainEvent =
  createDomainEventEmitter<TVoiceRoomsDomainPayloadMap>();
