/**
 * jsdom / Vitest lack Web Audio constructors that `@sapphi-red/web-noise-suppressor`
 * references at module load time (via MicrophoneService).
 */
if (typeof globalThis.AudioWorkletNode === 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).AudioWorkletNode = class AudioWorkletNode {};
}
