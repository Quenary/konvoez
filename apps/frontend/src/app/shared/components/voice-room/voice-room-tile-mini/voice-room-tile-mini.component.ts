import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  viewChild,
} from '@angular/core';
import { IUser } from '@konvoez/shared';
import { AudioActivityService } from '@core/services/audio-activity.service';
import { UserAvatarComponent } from '@shared/components/user-avatar/user-avatar.component';
import { TuiHint } from '@taiga-ui/core';
@Component({
  selector: 'app-voice-room-tile-mini',
  host: {
    '[class.speaking]': 'isSpeaking()',
  },
  imports: [UserAvatarComponent, TuiHint],
  templateUrl: './voice-room-tile-mini.component.html',
  styleUrl: './voice-room-tile-mini.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VoiceRoomTileMiniComponent {
  private readonly audioActivityService = inject(AudioActivityService);

  public readonly peer = input.required<IUser>();
  public readonly videoTrack = input<MediaStreamTrack | null>(null);

  private readonly videoEl = viewChild<ElementRef<HTMLVideoElement>>('videoEl');

  protected readonly hintLabel = computed(() => {
    const p = this.peer();
    return p.fullname && p.fullname !== p.username ? p.fullname : p.username;
  });

  protected readonly isSpeaking = computed(() => {
    const speakingMap = this.audioActivityService.speakingMap();
    return Boolean(speakingMap[this.peer().id]);
  });

  constructor() {
    effect(() => {
      const el = this.videoEl()?.nativeElement;
      const track = this.videoTrack();
      if (!el) {
        return;
      }
      if (!track) {
        el.srcObject = null;
        return;
      }
      const stream = el.srcObject;
      if (
        stream instanceof MediaStream &&
        stream.getVideoTracks()[0] === track
      ) {
        void el.play()?.catch(() => undefined);
        return;
      }
      el.srcObject = new MediaStream([track]);
      void el.play()?.catch(() => undefined);
    });
  }
}
