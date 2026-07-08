import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  resource,
  signal,
} from '@angular/core';
import { VoiceRoomService } from '@core/services/voice-room.service';
import { AvatarModule } from 'primeng/avatar';
import { ContextMenuModule } from 'primeng/contextmenu';
import { Store } from '@ngrx/store';
import { selectMe } from '@features/auth/auth.selectors';
import { MicrophoneService } from '@core/services/microphone.service';
import { AvatarsApiService } from '@features/avatars/avatars-api.service';
import { lastValueFrom } from 'rxjs';
import { UserCommon } from '@konvoez/common';

@Component({
  selector: 'app-room-peer',
  imports: [AvatarModule, ContextMenuModule],
  templateUrl: './room-peer.component.html',
  styleUrl: './room-peer.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RoomPeerComponent {
  private readonly store = inject(Store);
  private readonly voiceRoomService = inject(VoiceRoomService);
  private readonly microphoneService = inject(MicrophoneService);
  private readonly avatarsApiService = inject(AvatarsApiService);

  public readonly peer = input.required<UserCommon.IUser>();

  /**
   * Current audio level
   */
  protected readonly audioLevel = signal<number>(0);
  /**
   * Avatar signed url
   */
  protected readonly avatarSignedUrl = resource({
    params: () => ({ url: this.avatarUrl() }),
    loader: (params) =>
      params.params.url
        ? lastValueFrom(this.avatarsApiService.getUrl(params.params.url))
        : Promise.resolve(undefined),
  });

  /**
   * Avatar plain url
   */
  private readonly avatarUrl = computed<string | null>(() => {
    return this.peer()?.avatar ?? null;
  });
  /**
   * Microphone muted flag
   */
  private readonly microphoneMuted = this.voiceRoomService.microphoneMuted;
  /**
   * Current user info
   */
  private readonly me = this.store.selectSignal(selectMe);
  /**
   * Peer is current user flag
   */
  private readonly isMe = computed(() => {
    const me = this.me();
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
   * Defined analyzer node (self or others)
   */
  private readonly analyserNode = computed(() => {
    const isMe = this.isMe();
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
    let intervalRef: any = null;
    effect(() => {
      const an = this.analyserNode();
      this.audioLevel.set(0);
      clearInterval(intervalRef);
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
