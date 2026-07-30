import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MediaDevicesService } from '@core/services/media-devices.service';
import { Store } from '@ngrx/store';
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
} from '@taiga-ui/core';
import {
  TuiSelect,
  TuiDataListWrapper,
  TuiChevron,
  TuiTooltip,
} from '@taiga-ui/kit';
import { TuiCardLarge, TuiForm, TuiHeader } from '@taiga-ui/layout';
import { from, switchMap, catchError, of } from 'rxjs';
import { SettingsActions } from '../settings.actions';
import { selectAudioInput, selectAudioOutput } from '../settings.selectors';

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
  private readonly store = inject(Store);
  private readonly mediaDevicesService = inject(MediaDevicesService);
  private readonly tuiNotificationsService = inject(TuiNotificationService);
  private readonly translateService = inject(TranslateService);

  /**
   * Selected audio input
   */
  protected readonly audioInput = this.store.selectSignal(selectAudioInput);
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
  protected readonly audioOutput = this.store.selectSignal(selectAudioOutput);
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
    const devices = this.devices() ?? [];
    return devices.filter((d) => d.kind == 'audioinput');
  });
  /**
   * List of available outputs
   */
  protected readonly audioOutputList = computed(() => {
    const devices = this.devices() ?? [];
    return devices.filter((d) => d.kind == 'audiooutput');
  });

  /**
   * All audio devices
   */
  private readonly devices = toSignal(
    from(this.mediaDevicesService.getUserMedia({ audio: true })).pipe(
      switchMap(() => from(this.mediaDevicesService.enumerateDevices())),
      catchError(() => {
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
        return of([]);
      }),
    ),
    { initialValue: [] },
  );

  /**
   * Select audio input
   */
  protected onSelectAudioInput(audioInput: MediaDeviceInfo) {
    this.store.dispatch(SettingsActions.setAudioInput({ audioInput }));
  }

  /**
   * Select audio output
   */
  protected onSelectAudioOutput(audioOutput: MediaDeviceInfo) {
    this.store.dispatch(SettingsActions.setAudioOutput({ audioOutput }));
  }
}
