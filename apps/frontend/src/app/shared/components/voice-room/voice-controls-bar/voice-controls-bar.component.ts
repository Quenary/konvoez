import {
  ChangeDetectionStrategy,
  Component,
  inject,
  output,
} from '@angular/core';
import { VoiceRoomService } from '@core/services/voice-room.service';
import { AudioService } from '@core/services/audio.service';
import { TuiButton, TuiHint } from '@taiga-ui/core';
import { TranslatePipe } from '@ngx-translate/core';

@Component({
  selector: 'app-voice-controls-bar',
  imports: [TuiButton, TuiHint, TranslatePipe],
  templateUrl: './voice-controls-bar.component.html',
  styleUrl: './voice-controls-bar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VoiceControlsBarComponent {
  private readonly voiceRoomService = inject(VoiceRoomService);
  private readonly audioService = inject(AudioService);

  public readonly hangup = output<void>();

  protected readonly micMuted = this.voiceRoomService.microphoneMuted;
  protected readonly speakerMuted = this.voiceRoomService.speakerMuted;

  protected toggleMicrophone(): void {
    const value = !this.micMuted();
    this.voiceRoomService.setMicrophoneMuted(value);
    if (!value) {
      this.voiceRoomService.setSpeakerMuted(false);
    }
    this.audioService.playMuteAudio();
  }

  protected toggleSpeaker(): void {
    const value = !this.speakerMuted();
    this.voiceRoomService.setSpeakerMuted(value);
    if (value) {
      this.voiceRoomService.setMicrophoneMuted(true);
    }
    this.audioService.playMuteAudio();
  }

  protected onHangupClick(): void {
    this.hangup.emit();
  }
}
