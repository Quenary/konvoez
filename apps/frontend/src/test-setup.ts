import { TestBed } from '@angular/core/testing';
import { beforeEach } from 'vitest';

/**
 * jsdom / Vitest lack Web Audio constructors that `@sapphi-red/web-noise-suppressor`
 * references at module load time (via MicrophoneService).
 */
if (typeof globalThis.AudioWorkletNode === 'undefined') {
  (globalThis as { AudioWorkletNode: unknown }).AudioWorkletNode =
    class AudioWorkletNode {};
}

// The unit-test runner keeps one TestBed per worker (isolate is off).
// Angular resets it after a test only while destroyAfterEach stays at the
// default, so a spec that leaves the module instantiated breaks the next
// file's configureTestingModule. This file is loaded before each spec and
// file hooks run before describe hooks, so the reset happens first.
beforeEach(() => {
  TestBed.resetTestingModule();
});
