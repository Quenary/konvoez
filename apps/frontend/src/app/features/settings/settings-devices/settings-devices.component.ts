import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MediaDevicesService } from '@core/services/media-devices.service';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
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
import { catchError, finalize, from, of, switchMap } from 'rxjs';
import { SettingsStore } from '../settings.store';

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
      stringify: signal((a: MediaDeviceInfo) => a.label),
      identityMatcher: signal(
        (a: MediaDeviceInfo, b: MediaDeviceInfo) => a.deviceId === b.deviceId,
      ),
    }),
  ],
  templateUrl: './settings-devices.component.html',
  styleUrl: './settings-devices.component.scss',
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
    const devices = this.devices.value();
    return devices.filter((d) => d.kind == 'audioinput');
  });
  /**
   * List of available outputs
   */
  protected readonly audioOutputList = computed(() => {
    const devices = this.devices.value() ?? [];
    return devices.filter((d) => d.kind == 'audiooutput');
  });

  /**
   * All audio devices
   */
  protected readonly devices = rxResource({
    stream: () =>
      from(this.mediaDevicesService.getUserMedia({ audio: true })).pipe(
        switchMap((stream) =>
          from(this.mediaDevicesService.enumerateDevices()).pipe(
            finalize(() => {
              stream.getTracks().forEach((track) => track.stop());
            }),
          ),
        ),
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
          return of([]);
        }),
      ),
    defaultValue: [],
  });

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
}
