import './testing/web-noise-suppressor.mock';

/**
 * jsdom / Vitest lack Web Audio constructors that `@sapphi-red/web-noise-suppressor`
 * references at module load time (via MicrophoneService).
 */
if (typeof globalThis.AudioWorkletNode === 'undefined') {
  (globalThis as { AudioWorkletNode: unknown }).AudioWorkletNode =
    class AudioWorkletNode {};
}
