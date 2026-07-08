import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  resource,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  from,
  switchMap,
  catchError,
  of,
  lastValueFrom,
  firstValueFrom,
} from 'rxjs';
import { MediaDevicesService } from '@core/services/media-devices.service';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { MessageService } from 'primeng/api';
import { Store } from '@ngrx/store';
import { selectAudioInput, selectAudioOutput } from './settings.selectors';
import { SelectModule } from 'primeng/select';
import { SettingsActions } from './settings.actions';
import { FormsModule } from '@angular/forms';
import { IftaLabelModule } from 'primeng/iftalabel';
import { TooltipModule } from 'primeng/tooltip';
import { AuthActions } from '../auth/auth.actions';
import { ButtonModule } from 'primeng/button';
import { FileUploadHandlerEvent, FileUploadModule } from 'primeng/fileupload';
import { AvatarModule } from 'primeng/avatar';
import { AvatarsApiService } from '../avatars/avatars-api.service';
import { maxAvatarSize } from '@konvoez/common';
import { selectMe } from '../auth/auth.selectors';
import { SettingsApiService } from './settings-api.service';

@Component({
  selector: 'app-settings',
  imports: [
    SelectModule,
    FormsModule,
    IftaLabelModule,
    TranslatePipe,
    TooltipModule,
    ButtonModule,
    FileUploadModule,
    AvatarModule,
  ],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsComponent {
  private readonly store = inject(Store);
  private readonly mediaDevicesService = inject(MediaDevicesService);
  private readonly messageService = inject(MessageService);
  private readonly translateService = inject(TranslateService);
  private readonly avatarsApiService = inject(AvatarsApiService);
  private readonly settingsApiService = inject(SettingsApiService);

  protected readonly settings = resource({
    loader: () => firstValueFrom(this.settingsApiService.list()),
  });

  protected readonly me = this.store.selectSignal(selectMe);
  protected readonly avatarUrl = resource({
    params: () => ({ url: this.me()?.avatar }),
    loader: (params) =>
      params.params.url
        ? lastValueFrom(this.avatarsApiService.getUrl(params.params.url))
        : Promise.resolve(null),
  });

  protected readonly maxAvatarSize = maxAvatarSize;
  protected readonly audioInput = this.store.selectSignal(selectAudioInput);
  protected readonly audioOutput = this.store.selectSignal(selectAudioOutput);

  private readonly devices = toSignal(
    from(this.mediaDevicesService.getUserMedia({ audio: true })).pipe(
      switchMap(() => from(this.mediaDevicesService.enumerateDevices())),
      catchError(() => {
        this.messageService.add({
          severity: 'error',
          summary: this.translateService.instant(
            'CARDS.CARD.SCAN.PERMISSION_ERROR',
          ),
        });
        return of([]);
      }),
    ),
    { initialValue: [] },
  );
  protected readonly audioInputList = computed(() => {
    const devices = this.devices() ?? [];
    return devices.filter((d) => d.kind == 'audioinput');
  });
  protected readonly audioOutputList = computed(() => {
    const devices = this.devices() ?? [];
    return devices.filter((d) => d.kind == 'audiooutput');
  });

  private getDeviceById(deviceId: string): MediaDeviceInfo {
    const devices = this.devices() ?? [];
    return devices.find((d) => d.deviceId == deviceId) as MediaDeviceInfo;
  }

  protected onSelectAudioInput(deviceId: string) {
    const audioInput = this.getDeviceById(deviceId);
    this.store.dispatch(SettingsActions.setAudioInput({ audioInput }));
  }

  protected onSelectAudioOutput(deviceId: string) {
    const audioOutput = this.getDeviceById(deviceId);
    this.store.dispatch(SettingsActions.setAudioOutput({ audioOutput }));
  }

  protected logout(): void {
    this.store.dispatch(AuthActions.requestLogout());
  }

  onAvatarUpload($event: FileUploadHandlerEvent) {
    this.store.dispatch(
      AuthActions.uploadAvatar({
        file: $event.files[0],
      }),
    );
  }
}
