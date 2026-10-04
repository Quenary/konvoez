import {
  ChangeDetectionStrategy,
  Component,
  inject,
  output,
} from '@angular/core';
import { VoiceRoomStore } from '@features/voice-room/voice-room.store';
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
  private readonly voiceRoomStore = inject(VoiceRoomStore);
  private readonly audioService = inject(AudioService);

  public readonly hangup = output<void>();

  protected readonly micMuted = this.voiceRoomStore.microphoneMuted;
  protected readonly speakerMuted = this.voiceRoomStore.speakerMuted;

  protected toggleMicrophone(): void {
    const value = !this.micMuted();
    this.voiceRoomStore.setMicrophoneMuted(value);
    if (!value) {
      this.voiceRoomStore.setSpeakerMuted(false);
    }
    this.audioService.playMuteAudio();
  }

  protected toggleSpeaker(): void {
    const value = !this.speakerMuted();
    this.voiceRoomStore.setSpeakerMuted(value);
    if (value) {
      this.voiceRoomStore.setMicrophoneMuted(true);
    }
    this.audioService.playMuteAudio();
  }

  protected onHangupClick(): void {
    this.hangup.emit();
  }
}
