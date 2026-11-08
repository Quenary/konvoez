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
import { MicrophoneService } from '@core/services/microphone.service';
import { MediasoupSessionService } from '@core/services/mediasoup-session.service';
import { VoiceSessionService } from '@core/services/voice-session.service';
import { isDisplayMediaUserCancellation } from '@shared/functions/display-media-error.utils';
import { notifyError } from '@shared/functions/notify-error.function';
import {
  TuiButton,
  TuiGroup,
  TuiHint,
  TuiNotificationService,
} from '@taiga-ui/core';
import { TuiResponsiveDialogService } from '@taiga-ui/addon-mobile';
import { TuiButtonLoading } from '@taiga-ui/kit';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { PolymorpheusComponent } from '@taiga-ui/polymorpheus';
import { firstValueFrom } from 'rxjs';
import {
  StreamQualityDialogComponent,
  TStreamQualityDialogData,
  TStreamQualityDialogResult,
  TStreamQualityKind,
} from '../stream-quality-dialog/stream-quality-dialog.component';

import { icons } from '@constants';

@Component({
  selector: 'app-voice-room-controls-bar',
  imports: [TuiButton, TuiButtonLoading, TuiGroup, TuiHint, TranslatePipe],
  templateUrl: './voice-room-controls-bar.component.html',
  styleUrl: './voice-room-controls-bar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VoiceRoomControlsBarComponent {
  private readonly microphoneService = inject(MicrophoneService);
  private readonly voiceAudioPreferencesStore = inject(
    VoiceAudioPreferencesStore,
  );
  private readonly settingsStore = inject(SettingsStore);
  private readonly peerVideoService = inject(PeerVideoService);
  private readonly voiceSessionService = inject(VoiceSessionService);
  private readonly mediasoupSessionService = inject(MediasoupSessionService);
  private readonly screenCaptureService = inject(ScreenCaptureService);
  private readonly dialogService = inject(TuiResponsiveDialogService);
  private readonly injector = inject(Injector);
  private readonly translateService = inject(TranslateService);
  private readonly tuiNotificationsService = inject(TuiNotificationService);

  protected readonly icons = icons;
  public readonly hangup = output<void>();

  protected readonly micCaptureLoading = this.microphoneService.captureLoading;
  protected readonly micMuted = this.voiceAudioPreferencesStore.microphoneMuted;
  protected readonly speakerMuted =
    this.voiceAudioPreferencesStore.speakerMuted;
  protected readonly cameraOn = computed(
    () => this.peerVideoService.localCamTrack() !== null,
  );
  protected readonly screenOn = computed(
    () => this.peerVideoService.localScreenTrack() !== null,
  );
  protected readonly screenSupported = this.screenCaptureService.isSupported();
  protected readonly canProduce = this.voiceSessionService.canProduce;

  protected readonly cameraDisabled = computed(
    () => !this.canProduce() && !this.cameraOn(),
  );
  protected readonly screenDisabled = computed(
    () => !this.canProduce() && !this.screenOn(),
  );

  protected readonly micHintKey = computed(() => {
    const captureLoading = this.micCaptureLoading();
    const muted = this.micMuted();
    if (captureLoading) {
      return 'CALL.MICROPHONE_LOADING';
    }
    return muted ? 'CALL.UNMUTE_MICROPHONE' : 'CALL.MUTE_MICROPHONE';
  });
  protected readonly speakerHintKey = computed(() =>
    this.speakerMuted() ? 'CALL.UNMUTE_SPEAKER' : 'CALL.MUTE_SPEAKER',
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
            extraLayers: settings.extraLayers,
            svcMode: settings.svcMode,
            bitrateKbps: settings.bitrateKbps,
            contentMode: settings.contentMode,
            codec: settings.codec,
            codecs: this.mediasoupSessionService.videoCodecOptions(),
            maxBitrateKbps: this.settingsStore.streamMaxBitrateKbps(),
            cameraInput: settings.cameraInput,
          },
          size: kind === 'cam' ? 'm' : 's',
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
      if (kind === 'screen' && isDisplayMediaUserCancellation(error)) {
        return;
      }
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
          height: TStreamQualityDialogData['height'];
          fps: TStreamQualityDialogData['fps'];
          extraLayers: TStreamQualityDialogData['extraLayers'];
          svcMode: TStreamQualityDialogData['svcMode'];
          bitrateKbps: TStreamQualityDialogData['bitrateKbps'];
          contentMode: TStreamQualityDialogData['contentMode'];
          codec: TStreamQualityDialogData['codec'];
          cameraInput: TStreamQualityDialogData['cameraInput'];
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
          height: this.settingsStore.cameraHeight(),
          fps: this.settingsStore.cameraFps(),
          extraLayers: this.settingsStore.cameraExtraLayers(),
          svcMode: this.settingsStore.cameraSvcMode(),
          bitrateKbps: this.settingsStore.cameraBitrateKbps(),
          contentMode: 'motion' as const,
          codec: this.settingsStore.cameraCodec(),
          cameraInput: this.settingsStore.cameraInput(),
        }),
        save: (result) => {
          if (result.cameraInput) {
            this.settingsStore.setCameraInput(result.cameraInput);
          }
          this.settingsStore.setCameraHeight(result.height);
          this.settingsStore.setCameraFps(result.fps);
          this.settingsStore.setCameraExtraLayers(result.extraLayers);
          this.settingsStore.setCameraSvcMode(result.svcMode);
          this.settingsStore.setCameraBitrateKbps(result.bitrateKbps);
          this.settingsStore.setCameraCodec(result.codec);
        },
        stop: () => this.voiceSessionService.stopCamera(),
        produce: () => this.voiceSessionService.produceCamera(),
      },
      screen: {
        labelKey: 'CALL.SCREEN_SETTINGS',
        failedKey: 'CALL.SCREEN_FAILED',
        active: () => this.screenOn(),
        settings: () => ({
          height: this.settingsStore.screenHeight(),
          fps: this.settingsStore.screenFps(),
          extraLayers: this.settingsStore.screenExtraLayers(),
          svcMode: this.settingsStore.screenSvcMode(),
          bitrateKbps: this.settingsStore.screenBitrateKbps(),
          contentMode: this.settingsStore.screenContentMode(),
          codec: this.settingsStore.screenCodec(),
          cameraInput: null,
        }),
        save: (result) => {
          this.settingsStore.setScreenHeight(result.height);
          this.settingsStore.setScreenFps(result.fps);
          this.settingsStore.setScreenExtraLayers(result.extraLayers);
          this.settingsStore.setScreenSvcMode(result.svcMode);
          this.settingsStore.setScreenBitrateKbps(result.bitrateKbps);
          this.settingsStore.setScreenCodec(result.codec);
          if (result.contentMode) {
            this.settingsStore.setScreenContentMode(result.contentMode);
          }
        },
        stop: () => this.voiceSessionService.stopScreen(),
        produce: () => this.voiceSessionService.produceScreen(),
      },
    };
    return starts[kind];
  }
}
