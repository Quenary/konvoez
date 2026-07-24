import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  resource,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { from, switchMap, catchError, of, lastValueFrom } from 'rxjs';
import { MediaDevicesService } from '@core/services/media-devices.service';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { Store } from '@ngrx/store';
import { selectAudioInput, selectAudioOutput } from './settings.selectors';
import { SettingsActions } from './settings.actions';
import { FormsModule } from '@angular/forms';
import { AuthActions } from '../auth/auth.actions';
import { AvatarsApiService } from '../avatars/avatars-api.service';
import { selectMe } from '../auth/auth.selectors';
import {
  TuiButton,
  TuiDataList,
  TuiDropdown,
  TuiError,
  TuiIcon,
  TuiInput,
  tuiItemsHandlersProvider,
  TuiLabel,
  TuiNotification,
  TuiNotificationService,
} from '@taiga-ui/core';
import {
  TuiAvatar,
  TuiSelect,
  TuiDataListWrapper,
  TuiChevron,
  TuiInitialsPipe,
  TuiTooltip,
} from '@taiga-ui/kit';
import { TuiCardLarge, TuiForm, TuiHeader } from '@taiga-ui/layout';
import { NgTemplateOutlet } from '@angular/common';

@Component({
  selector: 'app-settings',
  imports: [
    FormsModule,
    TranslatePipe,
    TuiButton,
    TuiCardLarge,
    TuiError,
    TuiForm,
    TuiHeader,
    TuiIcon,
    TuiInput,
    TuiNotification,
    TuiAvatar,
    TuiSelect,
    TuiLabel,
    TuiDataListWrapper,
    TuiDataList,
    TuiDropdown,
    TuiChevron,
    TuiInitialsPipe,
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
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsComponent {
  private readonly store = inject(Store);
  private readonly mediaDevicesService = inject(MediaDevicesService);
  private readonly tuiNotificationsService = inject(TuiNotificationService);
  private readonly translateService = inject(TranslateService);
  private readonly avatarsApiService = inject(AvatarsApiService);

  /**
   * Current user info
   */
  protected readonly me = this.store.selectSignal(selectMe);
  /**
   * Current user name
   */
  protected readonly username = computed(() => this.me()?.username ?? '');
  /**
   * Current avatar signed url
   */
  protected readonly avatarUrl = resource({
    params: () => ({ url: this.me()?.avatar }),
    loader: (params) =>
      params.params.url
        ? lastValueFrom(this.avatarsApiService.getUrl(params.params.url))
        : Promise.resolve(null),
  });
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
          .open(this.translateService.instant('SETTINGS.PERMISSION_ERROR'), {
            appearance: 'negative',
            autoClose: 5000,
            closable: true,
          })
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

  protected logout(): void {
    this.store.dispatch(AuthActions.requestLogout());
  }

  protected uploadAvatar(input: HTMLInputElement): void {
    const file = input.files ? Array.from(input.files)[0] : null;
    input.files = null;
    input.blur();
    if (file) {
      this.store.dispatch(
        AuthActions.uploadAvatar({
          file,
        }),
      );
    }
  }
}
