import { EVoiceQualityTier } from './voice-adaptation';

export enum EVoiceConnectionState {
  CONNECTED = 'CONNECTED',
  DEGRADED = 'DEGRADED',
  RECONNECTING = 'RECONNECTING',
  DISCONNECTED = 'DISCONNECTED',
  DEAD = 'DEAD',
}

export enum EVoiceConnectionDeadReason {
  EVICTED = 'evicted',
  RECOVERY_FAILED = 'recovery-failed',
}

export type TVoiceTransportState =
  'new' | 'connecting' | 'connected' | 'disconnected' | 'failed' | 'closed';

export const VOICE_WATCHDOG_INTERVAL_MS = 2000;
export const VOICE_STALL_MS = 15000;
export const VOICE_ICE_RESTART_DELAY_MS = 3000;
export const VOICE_REJOIN_DELAY_MS = 10000;
export const VOICE_REJOIN_MAX_ATTEMPTS = 2;

export type TVoiceConnectionInput = {
  active: boolean;
  socketConnected: boolean;
  sendState: TVoiceTransportState | null;
  recvState: TVoiceTransportState | null;
  stalled: boolean;
  recovering: boolean;
  rejoinFailed: boolean;
  dead: EVoiceConnectionDeadReason | null;
  qualityTier: EVoiceQualityTier;
  audioSuspended: boolean;
};

/**
 * Derives the active voice connection health state based on hierarchical precedence.
 * Evaluates row by row and returns the first match.
 */
export function deriveVoiceConnectionState(
  input: TVoiceConnectionInput,
): EVoiceConnectionState | null {
  if (!input.active) {
    return null;
  }
  if (input.dead !== null) {
    return EVoiceConnectionState.DEAD;
  }
  if (!input.socketConnected) {
    return EVoiceConnectionState.DISCONNECTED;
  }
  if (
    input.sendState === 'failed' ||
    input.sendState === 'closed' ||
    input.recvState === 'failed' ||
    input.recvState === 'closed'
  ) {
    return EVoiceConnectionState.DISCONNECTED;
  }
  if (
    input.recovering ||
    input.rejoinFailed ||
    input.stalled ||
    input.sendState === 'disconnected' ||
    input.sendState === 'connecting' ||
    input.recvState === 'disconnected' ||
    input.recvState === 'connecting'
  ) {
    return EVoiceConnectionState.RECONNECTING;
  }
  if (
    input.qualityTier === EVoiceQualityTier.UNSTABLE ||
    input.qualityTier === EVoiceQualityTier.BAD ||
    input.audioSuspended
  ) {
    return EVoiceConnectionState.DEGRADED;
  }
  return EVoiceConnectionState.CONNECTED;
}

export type TVoiceLivenessTrack = {
  lastBytes: number | null;
  lastChangeMs: number;
};

export type TVoiceLivenessState = {
  send: TVoiceLivenessTrack;
  recv: TVoiceLivenessTrack;
};

export type TVoiceLivenessSample = {
  sendBytes: number | null;
  recvBytes: number | null;
  sendConnected: boolean;
  recvConnected: boolean;
};

export function createInitialVoiceLiveness(now: number): TVoiceLivenessState {
  return {
    send: { lastBytes: null, lastChangeMs: now },
    recv: { lastBytes: null, lastChangeMs: now },
  };
}

function advanceTrackLiveness(
  previous: TVoiceLivenessTrack,
  bytes: number | null,
  connected: boolean,
  now: number,
): TVoiceLivenessTrack {
  if (!connected || bytes === null || bytes !== previous.lastBytes) {
    return { lastBytes: bytes, lastChangeMs: now };
  }
  return previous;
}

export function advanceVoiceLiveness(
  previous: TVoiceLivenessState,
  sample: TVoiceLivenessSample,
  now: number,
): { state: TVoiceLivenessState; stalled: boolean } {
  const send = advanceTrackLiveness(
    previous.send,
    sample.sendBytes,
    sample.sendConnected,
    now,
  );
  const recv = advanceTrackLiveness(
    previous.recv,
    sample.recvBytes,
    sample.recvConnected,
    now,
  );

  const sendStalled =
    sample.sendConnected && now - send.lastChangeMs >= VOICE_STALL_MS;
  const recvStalled =
    sample.recvConnected && now - recv.lastChangeMs >= VOICE_STALL_MS;

  return {
    state: { send, recv },
    stalled: sendStalled || recvStalled,
  };
}
