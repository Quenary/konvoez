import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
import { Store } from '@ngrx/store';
import { selectCurrentUser } from '@core/auth/auth.selectors';
import { AudioActivityService } from '@core/services/audio-activity.service';
import { VoiceAudioPreferencesStore } from '@core/voice/voice-audio-preferences.store';
import { IVoiceRoomPeerUser } from '@konvoez/shared';
import { TranslatePipe } from '@ngx-translate/core';
import { TuiHint, TuiIcon } from '@taiga-ui/core';
import { TuiAutoColorPipe, TuiFade } from '@taiga-ui/kit';
import { TuiAsideItemDirective } from '@taiga-ui/layout';
import { UserAvatarComponent } from '@shared/components/user-avatar/user-avatar.component';

@Component({
  selector: 'app-room-peer',
  imports: [
    UserAvatarComponent,
    TuiAutoColorPipe,
    TuiFade,
    TuiHint,
    TuiIcon,
    TranslatePipe,
  ],
  templateUrl: './room-peer.component.html',
  styleUrl: './room-peer.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  hostDirectives: [TuiAsideItemDirective],
})
export class RoomPeerComponent {
  private readonly store = inject(Store);
  private readonly voiceAudioPreferencesStore = inject(
    VoiceAudioPreferencesStore,
  );
  private readonly audioActivityService = inject(AudioActivityService);

  public readonly peer = input.required<IVoiceRoomPeerUser>();

  protected readonly isLocal = computed(() => {
    const me = this.currentUser();
    const p = this.peer();
    return Boolean(me && p && me.id === p.id);
  });

  protected readonly isSpeaking = computed(() => {
    const speakingMap = this.audioActivityService.speakingMap();
    return Boolean(speakingMap[this.peer().id]);
  });

  protected readonly isMuted = computed(() => {
    const isLocal = this.isLocal();
    const localMuted = this.voiceAudioPreferencesStore.microphoneMuted();
    const peerMuted = Boolean(this.peer().muted);
    return isLocal ? localMuted : peerMuted;
  });

  protected readonly isDeafened = computed(() => {
    const isLocal = this.isLocal();
    const localDeafened = this.voiceAudioPreferencesStore.speakerMuted();
    const peerDeafened = Boolean(this.peer().deafened);
    return isLocal ? localDeafened : peerDeafened;
  });

  private readonly currentUser = this.store.selectSignal(selectCurrentUser);
}
