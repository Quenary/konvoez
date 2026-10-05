import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
} from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { TuiButton, TuiHint } from '@taiga-ui/core';
import { VoiceRoomViewService } from '../voice-room-view.service';

@Component({
  selector: 'app-voice-theatre-actions',
  imports: [TuiButton, TuiHint, TranslatePipe],
  templateUrl: './voice-theatre-actions.component.html',
  styleUrl: './voice-theatre-actions.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VoiceTheatreActionsComponent {
  private readonly voiceRoomViewService = inject(VoiceRoomViewService);

  public readonly showClose = input(true);
  public readonly fullscreenTarget = input<HTMLElement | null>(null);

  protected readonly isFullscreen = this.voiceRoomViewService.isFullscreen;

  protected onToggleFullscreen(): void {
    void this.voiceRoomViewService.toggleFullscreen(this.fullscreenTarget());
  }

  protected onCloseTheatre(): void {
    this.voiceRoomViewService.closeTheatre();
  }
}
