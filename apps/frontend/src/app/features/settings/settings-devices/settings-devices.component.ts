import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  signal,
} from '@angular/core';
import { rxResource, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MediaDevicesService } from '@core/services/media-devices.service';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  pickDefaultAudioInput,
  pickDefaultAudioOutput,
} from '@shared/functions/default-audio-devices.function';
import {
  TUI_ITEMS_HANDLERS,
  TuiIcon,
  TuiNotification,
  TuiLabel,
  TuiDataList,
  TuiDropdown,
  TuiNotificationService,
  TuiTitle,
  TuiButton,
  TuiSlider,
  TuiTextfield,
  TuiHint,
  TuiScrollbar,
} from '@taiga-ui/core';
import {
  TuiSelect,
  TuiDataListWrapper,
  TuiChevron,
  TuiTooltip,
  TuiButtonLoading,
  TuiSwitch,
  TuiProgressBar,
  TuiInputSlider,
} from '@taiga-ui/kit';
import { TuiCardLarge, TuiForm, TuiHeader } from '@taiga-ui/layout';
import { catchError, EMPTY, finalize, from, map, of, switchMap } from 'rxjs';
import { SettingsStore } from '@core/stores/settings.store';
import { MicTestService } from '@core/services/mic-test.service';
import { isSimdSupported } from '@core/audio/audio-capabilities';
import { ENoiseProcessor } from '../../../app.enums';
import { icons } from '../../../app.constants';
import { LayoutService } from '@core/services/layout.service';

type DevicesLoadResult = {
  devices: MediaDeviceInfo[];
  streamInputDeviceId: string | null;
};

const EMPTY_DEVICES: DevicesLoadResult = {
  devices: [],
  streamInputDeviceId: null,
};

type SelectableItem = MediaDeviceInfo | ENoiseProcessor;

@Component({
  selector: 'app-settings-devices',
  imports: [
    FormsModule,
    TranslatePipe,
    TuiCardLarge,
    TuiForm,
    TuiHeader,
    TuiIcon,
    TuiTitle,
    TuiNotification,
    TuiSelect,
    TuiLabel,
    TuiDataListWrapper,
    TuiDataList,
    TuiDropdown,
    TuiChevron,
    NgTemplateOutlet,
    TuiTooltip,
    TuiButton,
    TuiButtonLoading,
    TuiSwitch,
    TuiSlider,
    TuiProgressBar,
    TuiTextfield,
    TuiInputSlider,
    TuiHint,
    TuiScrollbar,
  ],
  providers: [
    {
      provide: TUI_ITEMS_HANDLERS,
      useFactory: () => {
        const translateService = inject(TranslateService);
        return {
          stringify: signal(
            (item: SelectableItem | null | undefined): string => {
              if (!item) return '';
              if (typeof item === 'string') {
                switch (item) {
                  case ENoiseProcessor.DEEPFILTER:
                    return translateService.instant(
                      'SETTINGS.DEVICES.PROCESSOR_DEEPFILTER',
                    );
                  case ENoiseProcessor.RNNOISE:
                    return translateService.instant(
                      'SETTINGS.DEVICES.PROCESSOR_RNNOISE',
                    );
                  case ENoiseProcessor.BROWSER:
                    return translateService.instant(
                      'SETTINGS.DEVICES.PROCESSOR_BROWSER',
                    );
                  case ENoiseProcessor.OFF:
                    return translateService.instant(
                      'SETTINGS.DEVICES.PROCESSOR_OFF',
                    );
                }
              }
              return item.label ?? '';
            },
          ),
          identityMatcher: signal(
            (
              a: SelectableItem | null | undefined,
              b: SelectableItem | null | undefined,
            ): boolean => {
              if (a === b) {
                return true;
              }
              if (!a || !b) {
                return false;
              }
              if (typeof a === 'string' || typeof b === 'string') {
                return a === b;
              }
              return a.deviceId === b.deviceId;
            },
          ),
          disabledItemHandler: signal(
            (item: SelectableItem | null | undefined): boolean => {
              if (item === ENoiseProcessor.DEEPFILTER && !isSimdSupported()) {
                return true;
              }
              return false;
            },
          ),
        };
      },
    },
  ],
  templateUrl: './settings-devices.component.html',
  styleUrl: './settings-devices.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsDevicesComponent {
  private readonly settingsStore = inject(SettingsStore);
  private readonly micTestService = inject(MicTestService);
  private readonly mediaDevicesService = inject(MediaDevicesService);
  private readonly tuiNotificationsService = inject(TuiNotificationService);
  private readonly translateService = inject(TranslateService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly layoutService = inject(LayoutService);

  protected readonly icons = icons;
  protected readonly isNarrow = this.layoutService.isNarrow;
  protected readonly audioInput = this.settingsStore.audioInput;
  protected readonly audioInputAvailable = computed(() => {
    const audioInput = this.audioInput();
    const audioInputList = this.audioInputList();
    return (
      audioInput &&
      audioInputList.some((item) => item.deviceId === audioInput.deviceId)
    );
  });
  protected readonly audioOutput = this.settingsStore.audioOutput;
  protected readonly audioOutputAvailable = computed(() => {
    const audioOutput = this.audioOutput();
    const audioOutputList = this.audioOutputList();
    return (
      audioOutput &&
      audioOutputList.some((item) => item.deviceId === audioOutput.deviceId)
    );
  });
  protected readonly audioInputList = computed(() => {
    const devices = this.devicesLoad.value().devices;
    return devices.filter((d) => d.kind === 'audioinput');
  });
  protected readonly audioOutputList = computed(() => {
    const devices = this.devicesLoad.value().devices;
    return devices.filter((d) => d.kind === 'audiooutput');
  });

  protected readonly noiseProcessor = this.settingsStore.noiseProcessor;
  protected readonly inputGainPercent = computed(() =>
    Math.round(this.settingsStore.inputGain() * 100),
  );
  protected readonly outputVolumePercent = computed(() =>
    Math.round(this.settingsStore.outputVolume() * 100),
  );
  protected readonly echoCancellation = this.settingsStore.echoCancellation;

  protected readonly isMicTesting = this.micTestService.isRunning;
  protected readonly micTestLevel = this.micTestService.level;
  protected readonly isSinkIdSupported = this.micTestService.isSinkIdSupported;
  protected readonly isSimdSupported = isSimdSupported();

  protected readonly processorOptions: ENoiseProcessor[] = [
    ENoiseProcessor.DEEPFILTER,
    ENoiseProcessor.RNNOISE,
    ENoiseProcessor.BROWSER,
    ENoiseProcessor.OFF,
  ];

  protected readonly devicesLoad = rxResource({
    stream: () =>
      from(this.mediaDevicesService.getUserMedia({ audio: true })).pipe(
        switchMap((stream) => {
          const streamInputDeviceId =
            stream.getAudioTracks()[0]?.getSettings()?.deviceId ?? null;

          return from(this.mediaDevicesService.enumerateDevices()).pipe(
            map((devices): DevicesLoadResult => ({
              devices,
              streamInputDeviceId,
            })),
            finalize(() => {
              stream.getTracks().forEach((track) => track.stop());
            }),
          );
        }),
        catchError(() => {
          this.tuiNotificationsService
            .open(
              this.translateService.instant(
                'SETTINGS.DEVICES.PERMISSION_ERROR',
              ),
              {
                appearance: 'negative',
                autoClose: 5000,
                closable: true,
              },
            )
            .subscribe();
          return of(EMPTY_DEVICES);
        }),
      ),
    defaultValue: EMPTY_DEVICES,
  });

  constructor() {
    this.destroyRef.onDestroy(() => void this.micTestService.stop());

    // Keep device lists in sync with plugged/unplugged hardware.
    this.mediaDevicesService.deviceChange$
      .pipe(
        switchMap(() =>
          from(this.mediaDevicesService.enumerateDevices()).pipe(
            catchError(() => EMPTY),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((devices) => {
        this.devicesLoad.update((value) => ({ ...value, devices }));
      });

    effect(() => {
      const { devices, streamInputDeviceId } = this.devicesLoad.value();
      const audioInput = this.settingsStore.audioInput();
      const audioOutput = this.settingsStore.audioOutput();

      if (!devices.length) {
        return;
      }

      if (!audioInput) {
        const input = pickDefaultAudioInput(devices, streamInputDeviceId);
        if (input) {
          this.settingsStore.setAudioInput(input);
        }
      }

      if (!audioOutput) {
        const output = pickDefaultAudioOutput(devices);
        if (output) {
          this.settingsStore.setAudioOutput(output);
        }
      }
    });
  }

  protected onSelectAudioInput(audioInput: MediaDeviceInfo): void {
    this.settingsStore.setAudioInput(audioInput);
    if (this.micTestService.isRunning()) {
      void this.micTestService.restart(
        audioInput,
        this.settingsStore.audioOutput(),
      );
    }
  }

  protected onSelectAudioOutput(audioOutput: MediaDeviceInfo): void {
    this.settingsStore.setAudioOutput(audioOutput);
    if (this.micTestService.isRunning()) {
      void this.micTestService.restart(
        this.settingsStore.audioInput(),
        audioOutput,
      );
    }
  }

  protected onSelectNoiseProcessor(processor: ENoiseProcessor): void {
    this.settingsStore.setNoiseProcessor(processor);
    if (this.micTestService.isRunning()) {
      void this.micTestService.restart();
    }
  }

  protected onInputGainChange(percent: number): void {
    const gain = percent / 100;
    this.settingsStore.setInputGain(gain);
  }

  protected onOutputVolumeChange(percent: number): void {
    this.settingsStore.setOutputVolume(percent / 100);
  }

  protected onEchoCancellationChange(enabled: boolean): void {
    this.settingsStore.setEchoCancellation(enabled);
    if (this.micTestService.isRunning()) {
      void this.micTestService.restart();
    }
  }

  protected async toggleMicTest(): Promise<void> {
    if (this.micTestService.isRunning()) {
      await this.micTestService.stop();
    } else {
      try {
        await this.micTestService.start(
          this.settingsStore.audioInput(),
          this.settingsStore.audioOutput(),
        );
      } catch (error) {
        console.warn('Failed to start mic test', error);
        this.tuiNotificationsService
          .open(
            this.translateService.instant('SETTINGS.DEVICES.PERMISSION_ERROR'),
            {
              appearance: 'negative',
              autoClose: 5000,
              closable: true,
            },
          )
          .subscribe();
      }
    }
  }
}
