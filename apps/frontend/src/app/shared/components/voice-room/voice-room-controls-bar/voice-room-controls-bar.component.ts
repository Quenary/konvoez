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
import { PeerVideoService } from '@core/services/peer-video.service';
import { ScreenCaptureService } from '@core/services/screen-capture.service';
import { VoiceSessionService } from '@core/services/voice-session.service';
import { notifyError } from '@shared/functions/notify-error.function';
import {
  TuiButton,
  TuiDialogService,
  TuiGroup,
  TuiHint,
  TuiNotificationService,
} from '@taiga-ui/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { PolymorpheusComponent } from '@taiga-ui/polymorpheus';
import { firstValueFrom } from 'rxjs';
import {
  StreamQualityDialogComponent,
  TStreamQualityDialogResult,
  TStreamQualityKind,
} from '../stream-quality-dialog/stream-quality-dialog.component';

@Component({
  selector: 'app-voice-room-controls-bar',
  imports: [TuiButton, TuiGroup, TuiHint, TranslatePipe],
  templateUrl: './voice-room-controls-bar.component.html',
  styleUrl: './voice-room-controls-bar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VoiceRoomControlsBarComponent {
  private readonly voiceRoomStore = inject(VoiceRoomStore);
  private readonly settingsStore = inject(SettingsStore);
  private readonly audioService = inject(AudioService);
  private readonly peerVideoService = inject(PeerVideoService);
  private readonly voiceSessionService = inject(VoiceSessionService);
  private readonly dialogService = inject(TuiDialogService);
  private readonly injector = inject(Injector);
  private readonly translateService = inject(TranslateService);
  private readonly tuiNotificationsService = inject(TuiNotificationService);

  public readonly hangup = output<void>();

  protected readonly micMuted = this.voiceRoomStore.microphoneMuted;
  protected readonly speakerMuted = this.voiceRoomStore.speakerMuted;
  protected readonly cameraOn = computed(
    () => this.peerVideoService.localCamTrack() !== null,
  );
  protected readonly screenOn = computed(
    () => this.peerVideoService.localScreenTrack() !== null,
  );
  protected readonly screenSupported = ScreenCaptureService.isSupported();

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

  protected async toggleStream(kind: TStreamQualityKind): Promise<void> {
    if (kind === 'screen' && !this.screenSupported) {
      return;
    }

    const active = kind === 'cam' ? this.cameraOn() : this.screenOn();
    if (active) {
      if (kind === 'cam') {
        await this.voiceSessionService.stopCamera();
      } else {
        await this.voiceSessionService.stopScreen();
      }
      return;
    }

    const screen = kind === 'screen';
    const result = await firstValueFrom(
      this.dialogService.open<TStreamQualityDialogResult | null>(
        new PolymorpheusComponent(StreamQualityDialogComponent, this.injector),
        {
          data: {
            kind,
            height: screen
              ? this.settingsStore.screenHeight()
              : this.settingsStore.streamHeight(),
            fps: screen
              ? this.settingsStore.screenFps()
              : this.settingsStore.streamFps(),
          },
          size: 's',
          dismissible: true,
          label: this.translateService.instant(
            screen ? 'CALL.SCREEN' : 'CALL.CAMERA',
          ),
        },
      ),
    );
    if (!result) {
      return;
    }

    if (screen) {
      this.settingsStore.setScreenHeight(result.height);
      this.settingsStore.setScreenFps(result.fps);
    } else {
      this.settingsStore.setStreamHeight(result.height);
      this.settingsStore.setStreamFps(result.fps);
    }

    try {
      if (screen) {
        await this.voiceSessionService.produceScreen();
      } else {
        await this.voiceSessionService.produceCamera();
      }
    } catch (error) {
      console.error(
        screen ? 'Failed to start screen share' : 'Failed to start camera',
        error,
      );
      notifyError(
        this.tuiNotificationsService,
        this.translateService,
        screen ? 'CALL.SCREEN_FAILED' : 'CALL.CAMERA_FAILED',
        error,
      );
    }
  }

  protected onHangupClick(): void {
    this.hangup.emit();
  }
}
