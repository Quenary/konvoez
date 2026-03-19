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
import { VoiceRoomCommon } from '@common/voice-room';
import { VoiceRoomService } from '../../../core/services/voice-room.service';
import { AvatarModule } from 'primeng/avatar';
import { ContextMenuModule } from 'primeng/contextmenu';
import { Store } from '@ngrx/store';
import { selectMe } from '../../auth/auth.selectors';
import { MicrophoneService } from '../../../core/services/microphone.service';
import { selectMicMuted } from '../../voice-room/voice-room.selectors';
import { AvatarsApiService } from '../../avatars/avatars-api.service';
import { lastValueFrom } from 'rxjs';

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

  public readonly peer = input.required<VoiceRoomCommon.IPeer>();

  protected readonly audioLevel = signal<number>(0);
  protected readonly avatarUrl = resource({
    params: () => ({ url: this.peer()?.avatar }),
    loader: (params) =>
      params.params.url
        ? lastValueFrom(this.avatarsApiService.getUrl(params.params.url))
        : Promise.resolve(undefined),
  });
  private readonly me = this.store.selectSignal(selectMe);
  private readonly micMuted = this.store.selectSignal(selectMicMuted);
  private readonly isMe = computed(() => {
    const me = this.me();
    const peer = this.peer();
    return me && peer && me.id == peer.id;
  });
  private readonly myAnalyserNode = resource({
    params: () => ({ isMe: this.isMe(), micMuted: this.micMuted() }),
    loader: (params) =>
      params.params.isMe && !params.params.micMuted
        ? this.microphoneService.getAnalyser()
        : Promise.resolve(null),
  });
  private readonly peerAnalyserNode = computed(() => {
    const peer = this.peer();
    const peers = this.voiceRoomService.peers();
    return peers.find((p) => p.id === peer.id)?.analyserNode || null;
  });
  private analyserNode = computed(() => {
    const myAnalyserNode = this.myAnalyserNode.value();
    const peerAnalyserNode = this.peerAnalyserNode();
    return myAnalyserNode || peerAnalyserNode;
  });

  constructor() {
    let intervalRef: any = null;
    effect(() => {
      const an = this.analyserNode();
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
