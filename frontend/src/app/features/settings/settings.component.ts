import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { from, switchMap, map, catchError, of } from 'rxjs';
import { MediaDevicesService } from '../../core/services/media-devices.service';
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

@Component({
  selector: 'app-settings',
  imports: [SelectModule, FormsModule, IftaLabelModule, TranslatePipe, TooltipModule, ButtonModule],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsComponent {
  private readonly store = inject(Store);
  private readonly mediaDevicesService = inject(MediaDevicesService);
  private readonly messageService = inject(MessageService);
  private readonly translateService = inject(TranslateService);

  protected readonly audioInput = this.store.selectSignal(selectAudioInput);
  protected readonly audioOutput = this.store.selectSignal(selectAudioOutput);

  private readonly devices = toSignal(
    from(this.mediaDevicesService.getUserMedia({ audio: true })).pipe(
      switchMap(() => from(this.mediaDevicesService.enumerateDevices())),
      catchError(() => {
        this.messageService.add({
          severity: 'error',
          summary: this.translateService.instant('CARDS.CARD.SCAN.PERMISSION_ERROR'),
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
}
