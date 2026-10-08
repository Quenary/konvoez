import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
} from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { TuiButton, TuiHint } from '@taiga-ui/core';
import { LocalScreenPreviewService } from '@core/services/local-screen-preview.service';

@Component({
  selector: 'app-voice-room-local-screen-preview-pause-button',
  imports: [TuiButton, TuiHint, TranslatePipe],
  templateUrl: './voice-room-local-screen-preview-pause-button.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VoiceRoomLocalScreenPreviewPauseButtonComponent {
  private readonly localScreenPreviewService = inject(
    LocalScreenPreviewService,
  );

  public readonly size = input<'s' | 'm'>('m');

  protected onPause(): void {
    this.localScreenPreviewService.pause();
  }
}
