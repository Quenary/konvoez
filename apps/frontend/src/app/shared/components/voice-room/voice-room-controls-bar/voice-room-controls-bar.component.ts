import {
  ChangeDetectionStrategy,
  Component,
  Injector,
  computed,
  inject,
  output,
} from '@angular/core';
import { VoiceAudioPreferencesStore } from '@core/voice/voice-audio-preferences.store';
import { SettingsStore } from '@core/stores/settings.store';
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
  private readonly voiceAudioPreferencesStore = inject(
    VoiceAudioPreferencesStore,
  );
  private readonly settingsStore = inject(SettingsStore);
  private readonly peerVideoService = inject(PeerVideoService);
  private readonly voiceSessionService = inject(VoiceSessionService);
  private readonly dialogService = inject(TuiDialogService);
  private readonly injector = inject(Injector);
  private readonly translateService = inject(TranslateService);
  private readonly tuiNotificationsService = inject(TuiNotificationService);

  public readonly hangup = output<void>();

  protected readonly micMuted = this.voiceAudioPreferencesStore.microphoneMuted;
  protected readonly speakerMuted =
    this.voiceAudioPreferencesStore.speakerMuted;
  protected readonly cameraOn = computed(
    () => this.peerVideoService.localCamTrack() !== null,
  );
  protected readonly screenOn = computed(
    () => this.peerVideoService.localScreenTrack() !== null,
  );
  protected readonly screenSupported = ScreenCaptureService.isSupported();
  protected readonly canProduce = this.voiceSessionService.canProduce;

  protected readonly cameraDisabled = computed(
    () => !this.canProduce() && !this.cameraOn(),
  );
  protected readonly screenDisabled = computed(
    () => !this.canProduce() && !this.screenOn(),
  );

  protected readonly micHintKey = computed(() =>
    this.micMuted() ? 'CALL.UNMUTE_MICROPHONE' : 'CALL.MUTE_MICROPHONE',
  );

  protected readonly cameraHintKey = computed(() => {
    if (this.canProduce() || this.cameraOn()) {
      return this.cameraOn() ? 'CALL.CAMERA_OFF' : 'CALL.CAMERA_ON';
    }
    return 'CALL.WAITING_FOR_CONNECTION';
  });

  protected readonly screenHintKey = computed(() => {
    if (this.canProduce() || this.screenOn()) {
      return this.screenOn() ? 'CALL.SCREEN_OFF' : 'CALL.SCREEN_ON';
    }
    return 'CALL.WAITING_FOR_CONNECTION';
  });

  protected toggleMicrophone(): void {
    this.voiceAudioPreferencesStore.toggleMicrophoneMuted();
  }

  protected toggleSpeaker(): void {
    this.voiceAudioPreferencesStore.toggleSpeakerMuted();
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
