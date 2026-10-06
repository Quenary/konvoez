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

  protected onHangupClick(): void {
    this.hangup.emit();
  }

  protected async toggleStream(kind: TStreamQualityKind): Promise<void> {
    if (kind === 'screen' && !this.screenSupported) {
      return;
    }

    const start = this.streamStart(kind);
    if (start.active()) {
      await start.stop();
      return;
    }

    const settings = start.settings();
    const result = await firstValueFrom(
      this.dialogService.open<TStreamQualityDialogResult | null>(
        new PolymorpheusComponent(StreamQualityDialogComponent, this.injector),
        {
          data: {
            kind,
            height: settings.height,
            fps: settings.fps,
          },
          size: 's',
          dismissible: true,
          label: this.translateService.instant(start.labelKey),
        },
      ),
      { defaultValue: null },
    );
    if (!result) {
      return;
    }

    start.save(result);

    try {
      await start.produce();
    } catch (error) {
      console.error(start.failedLog, error);
      notifyError(
        this.tuiNotificationsService,
        this.translateService,
        start.failedKey,
        error,
      );
    }
  }

  private streamStart(kind: TStreamQualityKind) {
    const starts: Record<
      TStreamQualityKind,
      {
        labelKey: string;
        failedKey: string;
        failedLog: string;
        active: () => boolean;
        settings: () => {
          height: TStreamQualityDialogResult['height'];
          fps: TStreamQualityDialogResult['fps'];
        };
        save: (result: TStreamQualityDialogResult) => void;
        stop: () => Promise<void>;
        produce: () => Promise<void>;
      }
    > = {
      cam: {
        labelKey: 'CALL.CAMERA',
        failedKey: 'CALL.CAMERA_FAILED',
        failedLog: 'Failed to start camera',
        active: () => this.cameraOn(),
        settings: () => ({
          height: this.settingsStore.streamHeight(),
          fps: this.settingsStore.streamFps(),
        }),
        save: (result) => {
          this.settingsStore.setStreamHeight(result.height);
          this.settingsStore.setStreamFps(result.fps);
        },
        stop: () => this.voiceSessionService.stopCamera(),
        produce: () => this.voiceSessionService.produceCamera(),
      },
      screen: {
        labelKey: 'CALL.SCREEN',
        failedKey: 'CALL.SCREEN_FAILED',
        failedLog: 'Failed to start screen share',
        active: () => this.screenOn(),
        settings: () => ({
          height: this.settingsStore.screenHeight(),
          fps: this.settingsStore.screenFps(),
        }),
        save: (result) => {
          this.settingsStore.setScreenHeight(result.height);
          this.settingsStore.setScreenFps(result.fps);
        },
        stop: () => this.voiceSessionService.stopScreen(),
        produce: () => this.voiceSessionService.produceScreen(),
      },
    };
    return starts[kind];
  }
}
