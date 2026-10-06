import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
import { IUser } from '@konvoez/shared';
import { AudioActivityService } from '@core/services/audio-activity.service';
import { UserAvatarComponent } from '@shared/components/user-avatar/user-avatar.component';
import { VideoTrackDirective } from '@shared/directives/video-track.directive';
import { TuiHint } from '@taiga-ui/core';

@Component({
  selector: 'app-voice-room-tile-mini',
  host: {
    '[class.speaking]': 'isSpeaking()',
  },
  imports: [UserAvatarComponent, TuiHint, VideoTrackDirective],
  templateUrl: './voice-room-tile-mini.component.html',
  styleUrl: './voice-room-tile-mini.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VoiceRoomTileMiniComponent {
  private readonly audioActivityService = inject(AudioActivityService);

  public readonly peer = input.required<IUser>();
  public readonly videoTrack = input<MediaStreamTrack | null>(null);

  protected readonly hintLabel = computed(() => {
    const p = this.peer();
    return p.fullname && p.fullname !== p.username ? p.fullname : p.username;
  });

  protected readonly isSpeaking = computed(() => {
    const speakingMap = this.audioActivityService.speakingMap();
    return Boolean(speakingMap[this.peer().id]);
  });
}
