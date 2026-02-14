import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  OnInit,
} from '@angular/core';
import { IPeerWithRTC } from '../../../features/voice-chat/voice-chat.reducer';
import { Store } from '@ngrx/store';
import { selectAudioOutput } from '../../../features/settings/settings.selectors';

@Component({
  selector: 'app-voice-peer',
  imports: [],
  templateUrl: './voice-peer.component.html',
  styleUrl: './voice-peer.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VoicePeerComponent implements OnInit {
  private readonly hostRef = inject(ElementRef<HTMLElement>, { host: true });
  private readonly store = inject(Store);

  public readonly peer = input.required<IPeerWithRTC>();

  private readonly audioOutput = this.store.selectSignal(selectAudioOutput);
  private readonly rtc = computed(() => {
    return this.peer().rtc;
  });
  private audioEl: HTMLAudioElement | null = null;
  private currentStream: MediaStream | null = null;

  constructor() {
    effect(() => {
      const audioOutput = this.audioOutput();
      this.setOutput(audioOutput);
    });
  }

  ngOnInit() {
    const rtc = this.rtc();
    rtc.addEventListener('track', this.handleTrack);
    rtc.addEventListener('connectionstatechange', this.handleConnectionState);
  }

  private handleTrack = (e: RTCTrackEvent) => {
    const stream = e.streams[0];
    if (!stream) return;
    if (this.audioEl) return;

    this.currentStream = stream;

    const audio = document.createElement('audio');
    audio.autoplay = true;
    audio.srcObject = stream;
    this.hostRef.nativeElement.appendChild(audio);
    this.audioEl = audio;
    this.setOutput(this.audioOutput());

    e.track.addEventListener('ended', this.cleanup);
  };

  private handleConnectionState = () => {
    const state = this.rtc().connectionState;
    if (state === 'failed' || state === 'disconnected' || state === 'closed') {
      this.cleanup();
    }
  };

  private cleanup = () => {
    if (!this.audioEl) return;
    if (this.currentStream) {
      this.currentStream.getTracks().forEach((t) => t.stop());
      this.currentStream = null;
    }
    this.audioEl.pause();
    this.audioEl.srcObject = null;
    this.audioEl.remove();
    this.audioEl = null;
  };

  private async setOutput(d: MediaDeviceInfo | null) {
    if (d && this.audioEl && this.audioEl.setSinkId) {
      const res = await this.audioEl.setSinkId(d.deviceId);
    }
  }

  ngOnDestroy() {
    const rtc = this.rtc();
    rtc.removeEventListener('track', this.handleTrack);
    rtc.removeEventListener('connectionstatechange', this.handleConnectionState);
    this.cleanup();
  }
}
