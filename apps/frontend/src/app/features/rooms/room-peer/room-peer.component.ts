import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
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
  private readonly audioActivityService = inject(AudioActivityService);

  public readonly peer = input.required<IUser>();

  protected readonly isSpeaking = computed(() => {
    const speakingMap = this.audioActivityService.speakingMap();
    return Boolean(speakingMap[this.peer().id]);
  });
}
