import { describe, expect, it } from 'vitest';
import { EVoiceQualityTier } from './voice-adaptation';
import {
  advanceVoiceLiveness,
  createInitialVoiceLiveness,
  deriveVoiceConnectionState,
  EVoiceConnectionDeadReason,
  EVoiceConnectionState,
  TVoiceConnectionInput,
  VOICE_STALL_MS,
} from './voice-connection';

const baseHealthyInput: TVoiceConnectionInput = {
  active: true,
  socketConnected: true,
  sendState: 'connected',
  recvState: 'connected',
  stalled: false,
  recovering: false,
  dead: null,
  qualityTier: EVoiceQualityTier.EXCELLENT,
  micFailed: false,
  audioSuspended: false,
};

describe('voice-connection', () => {
  describe('deriveVoiceConnectionState', () => {
    it('returns null when there is no active session regardless of other inputs', () => {
      expect(
        deriveVoiceConnectionState({
          ...baseHealthyInput,
          active: false,
          dead: EVoiceConnectionDeadReason.EVICTED,
          socketConnected: false,
        }),
      ).toBeNull();
    });

    it('returns DEAD when dead reason is set even if socket is disconnected', () => {
      expect(
        deriveVoiceConnectionState({
          ...baseHealthyInput,
          dead: EVoiceConnectionDeadReason.EVICTED,
          socketConnected: false,
        }),
      ).toBe(EVoiceConnectionState.DEAD);

      expect(
        deriveVoiceConnectionState({
          ...baseHealthyInput,
          dead: EVoiceConnectionDeadReason.RECOVERY_FAILED,
        }),
      ).toBe(EVoiceConnectionState.DEAD);
    });

    it('returns DISCONNECTED when socket is not connected', () => {
      expect(
        deriveVoiceConnectionState({
          ...baseHealthyInput,
          socketConnected: false,
        }),
      ).toBe(EVoiceConnectionState.DISCONNECTED);
    });

    it('returns DISCONNECTED when a transport is failed or closed', () => {
      expect(
        deriveVoiceConnectionState({
          ...baseHealthyInput,
          sendState: 'failed',
        }),
      ).toBe(EVoiceConnectionState.DISCONNECTED);

      expect(
        deriveVoiceConnectionState({
          ...baseHealthyInput,
          recvState: 'closed',
        }),
      ).toBe(EVoiceConnectionState.DISCONNECTED);
    });

    it('prefers DISCONNECTED over RECONNECTING when failed and stalled simultaneously', () => {
      expect(
        deriveVoiceConnectionState({
          ...baseHealthyInput,
          sendState: 'failed',
          stalled: true,
        }),
      ).toBe(EVoiceConnectionState.DISCONNECTED);
    });

    it('returns RECONNECTING when recovering, stalled, or a transport is connecting/disconnected', () => {
      expect(
        deriveVoiceConnectionState({
          ...baseHealthyInput,
          recovering: true,
        }),
      ).toBe(EVoiceConnectionState.RECONNECTING);

      expect(
        deriveVoiceConnectionState({
          ...baseHealthyInput,
          stalled: true,
        }),
      ).toBe(EVoiceConnectionState.RECONNECTING);

      expect(
        deriveVoiceConnectionState({
          ...baseHealthyInput,
          sendState: 'disconnected',
        }),
      ).toBe(EVoiceConnectionState.RECONNECTING);

      expect(
        deriveVoiceConnectionState({
          ...baseHealthyInput,
          recvState: 'connecting',
        }),
      ).toBe(EVoiceConnectionState.RECONNECTING);
    });

    it('prefers RECONNECTING over DEGRADED when transport is connecting and tier is BAD', () => {
      expect(
        deriveVoiceConnectionState({
          ...baseHealthyInput,
          sendState: 'connecting',
          qualityTier: EVoiceQualityTier.BAD,
        }),
      ).toBe(EVoiceConnectionState.RECONNECTING);
    });

    it('returns DEGRADED when tier is UNSTABLE or BAD, mic failed, mic muted, or audio suspended', () => {
      expect(
        deriveVoiceConnectionState({
          ...baseHealthyInput,
          qualityTier: EVoiceQualityTier.UNSTABLE,
        }),
      ).toBe(EVoiceConnectionState.DEGRADED);

      expect(
        deriveVoiceConnectionState({
          ...baseHealthyInput,
          qualityTier: EVoiceQualityTier.BAD,
        }),
      ).toBe(EVoiceConnectionState.DEGRADED);

      expect(
        deriveVoiceConnectionState({
          ...baseHealthyInput,
          micFailed: true,
        }),
      ).toBe(EVoiceConnectionState.DEGRADED);

      expect(
        deriveVoiceConnectionState({
          ...baseHealthyInput,
          audioSuspended: true,
        }),
      ).toBe(EVoiceConnectionState.DEGRADED);
    });

    it('returns CONNECTED when healthy, including new or uncreated transports', () => {
      expect(deriveVoiceConnectionState(baseHealthyInput)).toBe(
        EVoiceConnectionState.CONNECTED,
      );

      expect(
        deriveVoiceConnectionState({
          ...baseHealthyInput,
          sendState: 'new',
          recvState: null,
        }),
      ).toBe(EVoiceConnectionState.CONNECTED);
    });
  });

  describe('advanceVoiceLiveness', () => {
    it('creates initial liveness with the given timestamp', () => {
      const initial = createInitialVoiceLiveness(1000);
      expect(initial).toEqual({
        send: { lastBytes: null, lastChangeMs: 1000 },
        recv: { lastBytes: null, lastChangeMs: 1000 },
      });
    });

    it('updates lastChangeMs when bytes are growing', () => {
      const initial = createInitialVoiceLiveness(1000);
      const step1 = advanceVoiceLiveness(
        initial,
        {
          sendBytes: 100,
          recvBytes: 200,
          sendConnected: true,
          recvConnected: true,
        },
        3000,
      );

      expect(step1.stalled).toBe(false);
      expect(step1.state.send).toEqual({ lastBytes: 100, lastChangeMs: 3000 });
      expect(step1.state.recv).toEqual({ lastBytes: 200, lastChangeMs: 3000 });

      const step2 = advanceVoiceLiveness(
        step1.state,
        {
          sendBytes: 250,
          recvBytes: 400,
          sendConnected: true,
          recvConnected: true,
        },
        5000,
      );

      expect(step2.stalled).toBe(false);
      expect(step2.state.send).toEqual({ lastBytes: 250, lastChangeMs: 5000 });
      expect(step2.state.recv).toEqual({ lastBytes: 400, lastChangeMs: 5000 });
    });

    it('does not stall when bytes are frozen below VOICE_STALL_MS', () => {
      const initial = createInitialVoiceLiveness(1000);
      const step1 = advanceVoiceLiveness(
        initial,
        {
          sendBytes: 100,
          recvBytes: 100,
          sendConnected: true,
          recvConnected: true,
        },
        2000,
      );

      const step2 = advanceVoiceLiveness(
        step1.state,
        {
          sendBytes: 100,
          recvBytes: 100,
          sendConnected: true,
          recvConnected: true,
        },
        2000 + VOICE_STALL_MS - 1,
      );

      expect(step2.stalled).toBe(false);
    });

    it('stalls when a connected transport has frozen bytes for VOICE_STALL_MS or longer', () => {
      const initial = createInitialVoiceLiveness(1000);
      const step1 = advanceVoiceLiveness(
        initial,
        {
          sendBytes: 100,
          recvBytes: 100,
          sendConnected: true,
          recvConnected: true,
        },
        2000,
      );

      const step2 = advanceVoiceLiveness(
        step1.state,
        {
          sendBytes: 100,
          recvBytes: 500, // recv grows, but send is frozen
          sendConnected: true,
          recvConnected: true,
        },
        2000 + VOICE_STALL_MS,
      );

      expect(step2.stalled).toBe(true);
    });

    it('resets change timestamp and never stalls when transport is not connected or bytes are null', () => {
      const initial = createInitialVoiceLiveness(1000);
      const step1 = advanceVoiceLiveness(
        initial,
        {
          sendBytes: 100,
          recvBytes: null,
          sendConnected: true,
          recvConnected: false,
        },
        2000,
      );

      const step2 = advanceVoiceLiveness(
        step1.state,
        {
          sendBytes: null, // send disconnected/null
          recvBytes: null,
          sendConnected: false,
          recvConnected: false,
        },
        2000 + VOICE_STALL_MS * 2,
      );

      expect(step2.stalled).toBe(false);
      expect(step2.state.send.lastChangeMs).toBe(2000 + VOICE_STALL_MS * 2);
      expect(step2.state.recv.lastChangeMs).toBe(2000 + VOICE_STALL_MS * 2);
    });
  });
});
