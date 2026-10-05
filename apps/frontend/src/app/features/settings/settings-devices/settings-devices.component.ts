import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MediaDevicesService } from '@core/services/media-devices.service';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  pickDefaultAudioInput,
  pickDefaultAudioOutput,
} from '@shared/functions/default-audio-devices.function';
import {
  TuiError,
  TuiIcon,
  TuiInput,
  TuiNotification,
  TuiLabel,
  TuiDataList,
  TuiDropdown,
  tuiItemsHandlersProvider,
  TuiNotificationService,
  TuiTitle,
  TuiButton,
} from '@taiga-ui/core';
import {
  TuiSelect,
  TuiDataListWrapper,
  TuiChevron,
  TuiTooltip,
  TuiButtonLoading,
} from '@taiga-ui/kit';
import { TuiCardLarge, TuiForm, TuiHeader } from '@taiga-ui/layout';
import { catchError, finalize, from, map, of, switchMap } from 'rxjs';
import { SettingsStore } from '../settings.store';
import {
  STREAM_FPS_OPTIONS,
  STREAM_HEIGHTS,
  TStreamFps,
  TStreamHeight,
} from '@shared/schemas/local-settings.schema';

type DevicesLoadResult = {
  devices: MediaDeviceInfo[];
  streamInputDeviceId: string | null;
};

const EMPTY_DEVICES: DevicesLoadResult = {
  devices: [],
  streamInputDeviceId: null,
};

type TStreamSelectValue = TStreamHeight | TStreamFps;
type TDeviceSelectValue = MediaDeviceInfo | TStreamSelectValue;

function stringifyDeviceSelectItem(
  item: TDeviceSelectValue | null | undefined,
): string {
  if (item == null) {
    return '';
  }
  if (typeof item === 'number') {
    return (STREAM_HEIGHTS as readonly number[]).includes(item)
      ? `${item}p`
      : String(item);
  }
  return item.label;
}

function identityMatchDeviceSelectItem(
  a: TDeviceSelectValue,
  b: TDeviceSelectValue,
): boolean {
  if (typeof a === 'number' && typeof b === 'number') {
    return a === b;
  }
  if (typeof a === 'object' && typeof b === 'object') {
    return a.deviceId === b.deviceId;
  }
  return false;
}

@Component({
  selector: 'app-settings-devices',
  imports: [
    FormsModule,
    TranslatePipe,
    TuiCardLarge,
    TuiError,
    TuiForm,
    TuiHeader,
    TuiIcon,
    TuiTitle,
    TuiInput,
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
  ],
  providers: [
    tuiItemsHandlersProvider({
      stringify: signal(stringifyDeviceSelectItem),
      identityMatcher: signal(identityMatchDeviceSelectItem),
    }),
  ],
  templateUrl: './settings-devices.component.html',
  styleUrl: './settings-devices.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsDevicesComponent {
  private readonly settingsStore = inject(SettingsStore);
  private readonly mediaDevicesService = inject(MediaDevicesService);
  private readonly tuiNotificationsService = inject(TuiNotificationService);
  private readonly translateService = inject(TranslateService);

  /**
   * Selected audio input
   */
  protected readonly audioInput = this.settingsStore.audioInput;
  /**
   * Is selected audio input available
   */
  protected readonly audioInputAvailable = computed(() => {
    const audioInput = this.audioInput();
    const audioInputList = this.audioInputList();
    return (
      audioInput &&
      audioInputList.some((item) => item.deviceId === audioInput.deviceId)
    );
  });
  /**
   * Selected audio output
   */
  protected readonly audioOutput = this.settingsStore.audioOutput;
  protected readonly streamHeight = this.settingsStore.streamHeight;
  protected readonly streamFps = this.settingsStore.streamFps;
  protected readonly streamHeights = [...STREAM_HEIGHTS];
  protected readonly streamFpsOptions = [...STREAM_FPS_OPTIONS];
  /**
   * Is selected audio output available
   */
  protected readonly audioOutputAvailable = computed(() => {
    const audioOutput = this.audioOutput();
    const audioOutputList = this.audioOutputList();
    return (
      audioOutput &&
      audioOutputList.some((item) => item.deviceId === audioOutput.deviceId)
    );
  });
  /**
   * List of available inputs
   */
  protected readonly audioInputList = computed(() => {
    const devices = this.devicesLoad.value().devices;
    return devices.filter((d) => d.kind == 'audioinput');
  });
  /**
   * List of available outputs
   */
  protected readonly audioOutputList = computed(() => {
    const devices = this.devicesLoad.value().devices;
    return devices.filter((d) => d.kind == 'audiooutput');
  });

  /**
   * Enumerated audio devices (+ preferred input id from the permission stream).
   */
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

  /**
   * Select audio input
   */
  protected onSelectAudioInput(audioInput: MediaDeviceInfo) {
    this.settingsStore.setAudioInput(audioInput);
  }

  /**
   * Select audio output
   */
  protected onSelectAudioOutput(audioOutput: MediaDeviceInfo) {
    this.settingsStore.setAudioOutput(audioOutput);
  }

  protected onSelectStreamHeight(height: TStreamHeight): void {
    this.settingsStore.setStreamHeight(height);
  }

  protected onSelectStreamFps(fps: TStreamFps): void {
    this.settingsStore.setStreamFps(fps);
  }
}
