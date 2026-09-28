import { IUser } from './user.schemas';
import { EDirectCallEvent } from '../enums';

export enum EVoiceSessionType {
  GROUP_ROOM = 'GROUP_ROOM',
  DIRECT_CALL = 'DIRECT_CALL',
}

/**
 * Full join target (includes interlocutor for direct calls).
 */
export type TVoiceSessionTarget =
  | {
      readonly type: EVoiceSessionType.GROUP_ROOM;
      readonly roomId: number;
    }
  | {
      readonly type: EVoiceSessionType.DIRECT_CALL;
      readonly callId: string;
      readonly interlocutorId: number;
    };

/**
 * Session identity encoded in the mediasoup / socket.io room key.
 * Direct-call keys do not embed interlocutorId.
 */
export type TVoiceSessionIdentity =
  | {
      readonly type: EVoiceSessionType.GROUP_ROOM;
      readonly roomId: number;
    }
  | {
      readonly type: EVoiceSessionType.DIRECT_CALL;
      readonly callId: string;
    };

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

export interface ICallInitiatePayload {
  recipientId: number;
}

export interface ICallInitiateResult {
  callId: string;
  alreadyActive?: boolean;
}

export interface ICallIncomingPayload {
  callId: string;
  caller: IUser;
}

export interface ICallAcceptPayload {
  callId: string;
  callerId: number;
}

export interface ICallAcceptedPayload {
  callId: string;
  recipient: IUser;
}

export interface ICallRejectPayload {
  callId: string;
  callerId: number;
  reason?: 'declined' | 'busy';
}

export interface ICallRejectedPayload {
  callId: string;
  reason?: string;
}

export interface ICallHangupPayload {
  callId: string;
  byUserId: number;
}

export interface ICallEndedPayload {
  callId: string;
}

export interface ICallGetActivePayload {
  /** When omitted, returns any active call the current user participates in. */
  interlocutorId?: number;
}

export interface ICallGetActiveResult {
  callId: string;
  callerId: number;
  recipientId: number;
}

export type TDirectCallEventPayloadMap = {
  [EDirectCallEvent.CALL_INITIATE]: ICallInitiatePayload;
  [EDirectCallEvent.CALL_INCOMING]: ICallIncomingPayload;
  [EDirectCallEvent.CALL_ACCEPT]: ICallAcceptPayload;
  [EDirectCallEvent.CALL_ACCEPTED]: ICallAcceptedPayload;
  [EDirectCallEvent.CALL_REJECT]: ICallRejectPayload;
  [EDirectCallEvent.CALL_REJECTED]: ICallRejectedPayload;
  [EDirectCallEvent.CALL_HANGUP]: ICallHangupPayload;
  [EDirectCallEvent.CALL_ENDED]: ICallEndedPayload;
  [EDirectCallEvent.CALL_GET_ACTIVE]: ICallGetActivePayload;
};

export type TDirectCallEventResultMap = {
  [EDirectCallEvent.CALL_INITIATE]: ICallInitiateResult | { error: string };
  [EDirectCallEvent.CALL_INCOMING]: void;
  [EDirectCallEvent.CALL_ACCEPT]: object | { error: string };
  [EDirectCallEvent.CALL_ACCEPTED]: void;
  [EDirectCallEvent.CALL_REJECT]: object;
  [EDirectCallEvent.CALL_REJECTED]: void;
  [EDirectCallEvent.CALL_HANGUP]: void;
  [EDirectCallEvent.CALL_ENDED]: void;
  [EDirectCallEvent.CALL_GET_ACTIVE]: ICallGetActiveResult | null;
};
