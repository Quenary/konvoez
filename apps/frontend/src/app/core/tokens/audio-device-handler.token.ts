import { InjectionToken } from '@angular/core';

export interface IAudioDeviceHandler {
  setAudioInput(device: MediaDeviceInfo | null): void | Promise<void>;
  setAudioOutput(device: MediaDeviceInfo | null): void | Promise<void>;
}

export const AUDIO_DEVICE_HANDLER = new InjectionToken<IAudioDeviceHandler>(
  'AUDIO_DEVICE_HANDLER',
);
