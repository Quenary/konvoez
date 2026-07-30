import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { VoiceRoomService } from '@core/services/voice-room.service';
import { Store } from '@ngrx/store';
import { selectCurrentUser } from '@features/auth/auth.selectors';
import { MicrophoneService } from '@core/services/microphone.service';
import { IUser } from '@konvoez/shared';
import { NgOptimizedImage } from '@angular/common';
import { TuiAvatar, TuiInitialsPipe } from '@taiga-ui/kit';
import { TuiAsideItemDirective } from '@taiga-ui/layout';

@Component({
  selector: 'app-room-peer',
  imports: [
    NgOptimizedImage,
    TuiAvatar,
    TuiInitialsPipe,
    TuiAsideItemDirective,
  ],
  templateUrl: './room-peer.component.html',
  styleUrl: './room-peer.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RoomPeerComponent {
  private readonly store = inject(Store);
  private readonly voiceRoomService = inject(VoiceRoomService);
  private readonly microphoneService = inject(MicrophoneService);

  public readonly peer = input.required<IUser>();

  /**
   * Current audio level
   */
  protected readonly audioLevel = signal<number>(0);
  /**
   * Current user info
   */
  private readonly currentUser = this.store.selectSignal(selectCurrentUser);
  /**
   * Peer is current user flag
   */
  private readonly isCurrentUser = computed(() => {
    const me = this.currentUser();
    const peer = this.peer();
    return me && peer && me.id == peer.id;
  });
  /**
   * Managed peer from service
   */
  private readonly managedPeer = computed(() => {
    const peer = this.peer();
    const peers = this.voiceRoomService.peersDict();
    return peers[peer.id] ?? null;
  });
  /**
   * Other peer analyzer node
   */
  private readonly peerAnalyserNode = computed(() => {
    const managedPeer = this.managedPeer();
    return managedPeer?.analyserNode ?? null;
  });
  /**
   * Analyzer node (self or others)
   */
  private readonly analyserNode = computed(() => {
    const isMe = this.isCurrentUser();
    const microphoneMuted = this.voiceRoomService.microphoneMuted();
    const myAnalyserNode = this.microphoneService.analyserNode();
    const peerAnalyserNode = this.peerAnalyserNode();

    // myAnalyserNode всегда активна, даже если микрофон выключен
    // Чтобы в настройках можно было видеть уровень звука
    if (isMe && !microphoneMuted) {
      return myAnalyserNode;
    }
    if (!isMe) {
      return peerAnalyserNode;
    }
    return null;
  });

  constructor() {
    // Update audio level interval
    let intervalRef: ReturnType<typeof setInterval> | null = null;
    effect(() => {
      const an = this.analyserNode();
      this.audioLevel.set(0);

      if (intervalRef) {
        clearInterval(intervalRef);
        intervalRef = null;
      }

      if (an) {
        an.smoothingTimeConstant = 0.1;
        const dataArray = new Uint8Array(an.frequencyBinCount);
        intervalRef = setInterval(() => {
          an.getByteFrequencyData(dataArray);
          const average =
            dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
          this.audioLevel.set(average);
        }, 500);
      }
    });
  }
}
