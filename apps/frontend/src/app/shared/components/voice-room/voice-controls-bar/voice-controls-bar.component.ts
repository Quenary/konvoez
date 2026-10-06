import {
  ChangeDetectionStrategy,
  Component,
  Injector,
  computed,
  inject,
  output,
} from '@angular/core';
import { VoiceRoomStore } from '@features/voice-room/voice-room.store';
import { SettingsStore } from '@features/settings/settings.store';
import { AudioService } from '@core/services/audio.service';
import { MediasoupSessionService } from '@core/services/mediasoup-session.service';
import { PeerVideoService } from '@core/services/peer-video.service';
import { parseError } from '@shared/functions/parse-error.function';
import {
  TuiButton,
  TuiDialogService,
  TuiHint,
  TuiNotificationService,
} from '@taiga-ui/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { PolymorpheusComponent } from '@taiga-ui/polymorpheus';
import { firstValueFrom } from 'rxjs';
import {
  CameraStreamDialogComponent,
  TCameraStreamDialogResult,
} from '../camera-stream-dialog/camera-stream-dialog.component';

@Component({
  selector: 'app-voice-controls-bar',
  imports: [TuiButton, TuiHint, TranslatePipe],
  templateUrl: './voice-controls-bar.component.html',
  styleUrl: './voice-controls-bar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VoiceControlsBarComponent {
  private readonly voiceRoomStore = inject(VoiceRoomStore);
  private readonly settingsStore = inject(SettingsStore);
  private readonly audioService = inject(AudioService);
  private readonly mediasoupSessionService = inject(MediasoupSessionService);
  private readonly peerVideoService = inject(PeerVideoService);
  private readonly dialogService = inject(TuiDialogService);
  private readonly injector = inject(Injector);
  private readonly translateService = inject(TranslateService);
  private readonly tuiNotificationsService = inject(TuiNotificationService);

  public readonly hangup = output<void>();

  protected readonly micMuted = this.voiceRoomStore.microphoneMuted;
  protected readonly speakerMuted = this.voiceRoomStore.speakerMuted;
  protected readonly cameraOn = computed(
    () => this.peerVideoService.localTrack() !== null,
  );

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

  protected async toggleCamera(): Promise<void> {
    if (this.cameraOn()) {
      await this.mediasoupSessionService.stopCamera();
      return;
    }

    const result = await firstValueFrom(
      this.dialogService.open<TCameraStreamDialogResult | null>(
        new PolymorpheusComponent(CameraStreamDialogComponent, this.injector),
        {
          data: {
            height: this.settingsStore.streamHeight(),
            fps: this.settingsStore.streamFps(),
          },
          size: 's',
          dismissible: true,
          label: this.translateService.instant('CALL.CAMERA'),
        },
      ),
    );
    if (!result) {
      return;
    }

    this.settingsStore.setStreamHeight(result.height);
    this.settingsStore.setStreamFps(result.fps);

    try {
      await this.mediasoupSessionService.produceCamera();
    } catch (error) {
      console.error('Failed to start camera', error);
      this.tuiNotificationsService
        .open(
          parseError(error) ||
            this.translateService.instant('CALL.CAMERA_FAILED'),
          {
            appearance: 'negative',
            autoClose: 5000,
            closable: true,
          },
        )
        .subscribe();
    }
  }

  protected onHangupClick(): void {
    this.hangup.emit();
  }
}
