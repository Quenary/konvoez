import { Injectable, OnDestroy } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class SpeakerService implements OnDestroy {
  private context: AudioContext | null = null;
  private device: MediaDeviceInfo | null = null;

  private readonly onDeviceChange = async () => {
    await this.ensureContext();
  };

  constructor() {
    navigator.mediaDevices.addEventListener(
      'devicechange',
      this.onDeviceChange,
    );
  }

  private async ensureContext(): Promise<AudioContext> {
    if (!this.context || this.context.state === 'closed') {
      this.context = new AudioContext({ sampleRate: 48000 });
    }
    if (this.context.state === 'suspended') {
      await this.context.resume();
    }
    await this.setSinkId(this.device);
    return this.context;
  }

  private async setSinkId(device: MediaDeviceInfo | null) {
    if (
      this.context &&
      'setSinkId' in this.context &&
      typeof this.context.setSinkId == 'function'
    ) {
      try {
        if (device) {
          return await this.context.setSinkId(device.deviceId);
        }
      } catch {
        await this.context.setSinkId('default');
      }
    }
  }

  public async setDevice(device: MediaDeviceInfo | null) {
    this.device = device;
    await this.setSinkId(this.device);
  }

  public async getContext(): Promise<AudioContext> {
    return this.ensureContext();
  }

  ngOnDestroy(): void {
    navigator.mediaDevices.removeEventListener(
      'devicechange',
      this.onDeviceChange,
    );
  }
}
