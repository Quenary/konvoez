import * as z from 'zod';
import { userSafeSchema } from './user.schemas';
import { EDirectCallEvent, EVoiceSessionType } from '../enums';

export { EVoiceSessionType } from '../enums';

export const voiceSessionTypeSchema = z.enum(EVoiceSessionType);

export const voiceSessionTargetGroupRoomSchema = z.object({
  type: z.literal(EVoiceSessionType.GROUP_ROOM),
  roomId: z.number().int().positive(),
});

export const voiceSessionTargetDirectCallSchema = z.object({
  type: z.literal(EVoiceSessionType.DIRECT_CALL),
  callId: z.string().min(1),
  interlocutorId: z.number().int().positive(),
});

/**
 * Full join target (includes interlocutor for direct calls).
 */
export const voiceSessionTargetSchema = z.discriminatedUnion('type', [
  voiceSessionTargetGroupRoomSchema,
  voiceSessionTargetDirectCallSchema,
]);
export type TVoiceSessionTarget = z.infer<typeof voiceSessionTargetSchema>;

export const voiceSessionIdentityGroupRoomSchema = z.object({
  type: z.literal(EVoiceSessionType.GROUP_ROOM),
  roomId: z.number().int().positive(),
});

export const voiceSessionIdentityDirectCallSchema = z.object({
  type: z.literal(EVoiceSessionType.DIRECT_CALL),
  callId: z.string().min(1),
});

/**
 * Session identity encoded in the mediasoup / socket.io room key.
 * Direct-call keys do not embed interlocutorId.
 */
export const voiceSessionIdentitySchema = z.discriminatedUnion('type', [
  voiceSessionIdentityGroupRoomSchema,
  voiceSessionIdentityDirectCallSchema,
]);
export type TVoiceSessionIdentity = z.infer<typeof voiceSessionIdentitySchema>;

const GROUP_ROOM_PREFIX = 'room:';
const DIRECT_CALL_PREFIX = 'call:';

export function getVoiceSessionKey(
  target: TVoiceSessionTarget | TVoiceSessionIdentity,
): string {
  switch (target.type) {
    case EVoiceSessionType.GROUP_ROOM:
      return `${GROUP_ROOM_PREFIX}${target.roomId}`;
    case EVoiceSessionType.DIRECT_CALL:
      return `${DIRECT_CALL_PREFIX}${target.callId}`;
  }
}

export function parseVoiceSessionKey(
  key: string,
): TVoiceSessionIdentity | null {
  if (key.startsWith(GROUP_ROOM_PREFIX)) {
    const roomId = Number(key.slice(GROUP_ROOM_PREFIX.length));
    if (!Number.isInteger(roomId) || roomId <= 0) {
      return null;
    }
    return { type: EVoiceSessionType.GROUP_ROOM, roomId };
  }

  if (key.startsWith(DIRECT_CALL_PREFIX)) {
    const callId = key.slice(DIRECT_CALL_PREFIX.length);
    if (!callId) {
      return null;
    }
    return { type: EVoiceSessionType.DIRECT_CALL, callId };
  }

  return null;
}

export function isGroupVoiceSession(
  target: TVoiceSessionIdentity | TVoiceSessionTarget,
): target is Extract<
  TVoiceSessionIdentity,
  { type: EVoiceSessionType.GROUP_ROOM }
> {
  return target.type === EVoiceSessionType.GROUP_ROOM;
}

export function isDirectCallVoiceSession(
  target: TVoiceSessionIdentity | TVoiceSessionTarget,
): target is Extract<
  TVoiceSessionIdentity,
  { type: EVoiceSessionType.DIRECT_CALL }
> {
  return target.type === EVoiceSessionType.DIRECT_CALL;
}

export function getGroupRoomIdFromSessionKey(key: string): number | null {
  const target = parseVoiceSessionKey(key);
  return target && isGroupVoiceSession(target) ? target.roomId : null;
}

export function getDirectCallIdFromSessionKey(key: string): string | null {
  const target = parseVoiceSessionKey(key);
  return target && isDirectCallVoiceSession(target) ? target.callId : null;
}

export function toVoiceSessionIdentity(
  target: TVoiceSessionTarget,
): TVoiceSessionIdentity {
  if (target.type === EVoiceSessionType.GROUP_ROOM) {
    return { type: EVoiceSessionType.GROUP_ROOM, roomId: target.roomId };
  }
  return { type: EVoiceSessionType.DIRECT_CALL, callId: target.callId };
}

export const callInitiatePayloadSchema = z.object({
  recipientId: z.number().int().positive(),
});
export type TCallInitiatePayload = z.infer<typeof callInitiatePayloadSchema>;

export const callInitiateResultSchema = z.object({
  callId: z.string().min(1),
  alreadyActive: z.boolean().optional(),
});
export type TCallInitiateResult = z.infer<typeof callInitiateResultSchema>;

export const callIncomingPayloadSchema = z.object({
  callId: z.string().min(1),
  caller: userSafeSchema,
});
export type TCallIncomingPayload = z.infer<typeof callIncomingPayloadSchema>;

export const callAcceptPayloadSchema = z.object({
  callId: z.string().min(1),
  callerId: z.number().int().positive(),
});
export type TCallAcceptPayload = z.infer<typeof callAcceptPayloadSchema>;

export const callAcceptedPayloadSchema = z.object({
  callId: z.string().min(1),
  recipient: userSafeSchema,
});
export type TCallAcceptedPayload = z.infer<typeof callAcceptedPayloadSchema>;

export const callRejectPayloadSchema = z.object({
  callId: z.string().min(1),
  callerId: z.number().int().positive(),
  reason: z.enum(['declined', 'busy', 'failed']).optional(),
});
export type TCallRejectPayload = z.infer<typeof callRejectPayloadSchema>;

export const callRejectedPayloadSchema = z.object({
  callId: z.string().min(1),
  reason: z.string().optional(),
});
export type TCallRejectedPayload = z.infer<typeof callRejectedPayloadSchema>;

export const callHangupPayloadSchema = z.object({
  callId: z.string().min(1),
  byUserId: z.number().int().positive(),
});
export type TCallHangupPayload = z.infer<typeof callHangupPayloadSchema>;

export const callEndedPayloadSchema = z.object({
  callId: z.string().min(1),
  reason: z.literal('timeout').optional(),
});
export type TCallEndedPayload = z.infer<typeof callEndedPayloadSchema>;

export const callAnsweredElsewherePayloadSchema = z.object({
  callId: z.string().min(1),
  outcome: z.enum(['accepted', 'rejected']),
});
export type TCallAnsweredElsewherePayload = z.infer<
  typeof callAnsweredElsewherePayloadSchema
>;

/** Server-side ring timeout and client fallback offset share this value. */
export const DIRECT_CALL_RING_TIMEOUT_MS = 45_000;

export const callGetActivePayloadSchema = z
  .object({
    /** When omitted, returns any active call the current user participates in. */
    interlocutorId: z.number().int().positive().optional(),
  })
  .default({});
export type TCallGetActivePayload = z.infer<typeof callGetActivePayloadSchema>;

export const callGetActiveResultSchema = z.object({
  callId: z.string().min(1),
  callerId: z.number().int().positive(),
  recipientId: z.number().int().positive(),
});
export type TCallGetActiveResult = z.infer<typeof callGetActiveResultSchema>;

export type TDirectCallEventPayloadMap = {
  [EDirectCallEvent.CALL_INITIATE]: TCallInitiatePayload;
  [EDirectCallEvent.CALL_INCOMING]: TCallIncomingPayload;
  [EDirectCallEvent.CALL_ACCEPT]: TCallAcceptPayload;
  [EDirectCallEvent.CALL_ACCEPTED]: TCallAcceptedPayload;
  [EDirectCallEvent.CALL_REJECT]: TCallRejectPayload;
  [EDirectCallEvent.CALL_REJECTED]: TCallRejectedPayload;
  [EDirectCallEvent.CALL_HANGUP]: TCallHangupPayload;
  [EDirectCallEvent.CALL_ENDED]: TCallEndedPayload;
  [EDirectCallEvent.CALL_ANSWERED_ELSEWHERE]: TCallAnsweredElsewherePayload;
  [EDirectCallEvent.CALL_GET_ACTIVE]: TCallGetActivePayload;
};

export type TDirectCallEventResultMap = {
  [EDirectCallEvent.CALL_INITIATE]: TCallInitiateResult | { error: string };
  [EDirectCallEvent.CALL_INCOMING]: void;
  [EDirectCallEvent.CALL_ACCEPT]: object | { error: string };
  [EDirectCallEvent.CALL_ACCEPTED]: void;
  [EDirectCallEvent.CALL_REJECT]: object;
  [EDirectCallEvent.CALL_REJECTED]: void;
  [EDirectCallEvent.CALL_HANGUP]: void;
  [EDirectCallEvent.CALL_ENDED]: void;
  [EDirectCallEvent.CALL_ANSWERED_ELSEWHERE]: void;
  [EDirectCallEvent.CALL_GET_ACTIVE]: TCallGetActiveResult | null;
};
