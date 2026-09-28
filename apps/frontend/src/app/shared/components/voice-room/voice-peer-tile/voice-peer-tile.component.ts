import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IUser } from '@konvoez/shared';
import { UserAvatarComponent } from '@shared/components/user-avatar/user-avatar.component';
import { AudioActivityService } from '@core/services/audio-activity.service';
import { VoiceRoomService } from '@core/services/voice-room.service';
import { DirectCallService } from '@core/services/direct-call.service';
import { Store } from '@ngrx/store';
import { selectCurrentUser } from '@features/auth/auth.selectors';
import { TuiButton, TuiDropdown, TuiLabel, TuiSlider } from '@taiga-ui/core';
import { TuiAutoColorPipe, TuiBadge } from '@taiga-ui/kit';
import { TranslatePipe } from '@ngx-translate/core';

@Component({
  selector: 'app-voice-peer-tile',
  imports: [
    FormsModule,
    UserAvatarComponent,
    TuiBadge,
    TuiButton,
    TuiDropdown,
    TuiLabel,
    TuiSlider,
    TuiAutoColorPipe,
    TranslatePipe,
  ],
  templateUrl: './voice-peer-tile.component.html',
  styleUrl: './voice-peer-tile.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VoicePeerTileComponent {
  private readonly store = inject(Store);
  private readonly voiceRoomService = inject(VoiceRoomService);
  private readonly audioActivityService = inject(AudioActivityService);
  private readonly directCallService = inject(DirectCallService);
  private readonly currentUser = this.store.selectSignal(selectCurrentUser);

  public readonly peer = input.required<IUser>();
  public readonly videoTrack = input<MediaStreamTrack | null>(null);

  protected readonly isLocal = computed(() => {
    const me = this.currentUser();
    const p = this.peer();
    return Boolean(me && p && me.id === p.id);
  });

  protected readonly isCalling = computed(() => {
    const isLocal = this.isLocal();
    const isCalling = this.directCallService.isCalling();
    return !isLocal && isCalling;
  });

  protected readonly isSpeaking = computed(() => {
    return this.audioActivityService.selectIsSpeaking(this.peer().id)();
  });

  protected readonly isMuted = computed(() => {
    const isLocal = this.isLocal();
    const microphoneMuted = this.voiceRoomService.microphoneMuted();
    return isLocal ? microphoneMuted : false;
  });

  protected readonly isDeafened = computed(() => {
    const isLocal = this.isLocal();
    const speakerMuted = this.voiceRoomService.speakerMuted();
    return isLocal ? speakerMuted : false;
  });

  protected readonly volume = computed(() => {
    const levels = this.voiceRoomService.peerGainLevels();
    const gain = levels[this.peer().id] ?? 1;
    return Math.round(gain * 100);
  });

  protected readonly volumeIcon = computed(() => {
    const volume = this.volume();
    if (volume === 0) {
      return '@tui.volume-off';
    }
    if (volume < 50) {
      return '@tui.volume-1';
    }
    return '@tui.volume-2';
  });

  protected onVolumeChange(value: number): void {
    this.voiceRoomService.setPeerGain(this.peer().id, value / 100);
  }
}
