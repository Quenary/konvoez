import { Injectable, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { TuiNotificationService } from '@taiga-ui/core';

export type TMediaDeviceSwitchKind =
  'audioinput' | 'audiooutput' | 'videoinput';

const MESSAGE_KEYS: Record<TMediaDeviceSwitchKind, string> = {
  audioinput: 'SETTINGS.DEVICES.AUTO_SWITCHED_AUDIO_INPUT',
  audiooutput: 'SETTINGS.DEVICES.AUTO_SWITCHED_AUDIO_OUTPUT',
  videoinput: 'SETTINGS.DEVICES.AUTO_SWITCHED_VIDEO_INPUT',
};

/**
 * Toast for automatic device switches (devicechange / unplugged device).
 * Callers notify only after an actual switch to a different device.
 */
@Injectable({ providedIn: 'root' })
export class MediaDeviceSwitchNotifierService {
  private readonly translateService = inject(TranslateService);
  private readonly tuiNotificationService = inject(TuiNotificationService);

  public notify(kind: TMediaDeviceSwitchKind, label: string): void {
    this.tuiNotificationService
      .open(
        this.translateService.instant(MESSAGE_KEYS[kind], {
          label:
            label ||
            this.translateService.instant('SETTINGS.DEVICES.UNKNOWN_DEVICE'),
        }),
        { appearance: 'info', autoClose: 5000, closable: true },
      )
      .subscribe();
  }
}
