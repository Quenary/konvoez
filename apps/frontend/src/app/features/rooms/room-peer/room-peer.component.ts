import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
} from '@angular/core';
import { VoiceRoomService } from '@core/services/voice-room.service';
import { Store } from '@ngrx/store';
import { selectCurrentUser } from '@features/auth/auth.selectors';
import { MicrophoneService } from '@core/services/microphone.service';
import { AudioActivityService } from '@core/services/audio-activity.service';
import { IUser } from '@konvoez/shared';
import { TuiAutoColorPipe } from '@taiga-ui/kit';
import { TuiHint } from '@taiga-ui/core';
import { TuiAsideItemDirective } from '@taiga-ui/layout';
import { UserAvatarComponent } from '@shared/components/user-avatar/user-avatar.component';

@Component({
  selector: 'app-room-peer',
  imports: [UserAvatarComponent, TuiAutoColorPipe, TuiHint],
  templateUrl: './room-peer.component.html',
  styleUrl: './room-peer.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  hostDirectives: [TuiAsideItemDirective],
})
export class RoomPeerComponent {
  private readonly store = inject(Store);
  private readonly voiceRoomService = inject(VoiceRoomService);
  private readonly microphoneService = inject(MicrophoneService);
  private readonly audioActivityService = inject(AudioActivityService);

  public readonly peer = input.required<IUser>();

  protected readonly isSpeaking = computed(() => {
    return this.audioActivityService.selectIsSpeaking(this.peer().id)();
  });

  private readonly currentUser = this.store.selectSignal(selectCurrentUser);
  private readonly isCurrentUser = computed(() => {
    const me = this.currentUser();
    const peer = this.peer();
    return me && peer && me.id === peer.id;
  });

  constructor() {
    effect(() => {
      const isCurrentUser = this.isCurrentUser();
      const currentUser = this.currentUser();
      const microphoneMuted = this.voiceRoomService.microphoneMuted();
      const node = this.microphoneService.analyserNode();

      if (isCurrentUser && currentUser && node && !microphoneMuted) {
        this.audioActivityService.register(currentUser.id, node);
      } else if (isCurrentUser && currentUser) {
        this.audioActivityService.unregister(currentUser.id);
      }
    });
  }
}
