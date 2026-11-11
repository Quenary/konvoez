import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  TuiButton,
  TuiLoader,
  TuiNotification,
  TuiTitle,
} from '@taiga-ui/core';
import { TuiCheckbox } from '@taiga-ui/core/components/checkbox';
import type { TDesktopHotkeys } from '@konvoez/shared';
import type { THotkeyStatus } from '@konvoez/client-shell';
import { KONVOEZ_LOCAL_BRIDGE } from '../../app.config';
import { DesktopI18nService } from '../../core/i18n/desktop-i18n.service';
import { I18nPipe } from '../../core/i18n/i18n.pipe';
import { DialogLayoutComponent } from '../../components/dialog-layout/dialog-layout.component';
import { HotkeyInputComponent } from '../../components/hotkey-input/hotkey-input.component';

@Component({
  selector: 'app-settings-dialog',
  imports: [
    DialogLayoutComponent,
    FormsModule,
    HotkeyInputComponent,
    I18nPipe,
    TuiButton,
    TuiCheckbox,
    TuiLoader,
    TuiNotification,
    TuiTitle,
  ],
  templateUrl: './settings-dialog.component.html',
  styleUrl: './settings-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsDialogComponent implements OnInit {
  private readonly konvoezLocalBridge = inject(KONVOEZ_LOCAL_BRIDGE);
  private readonly desktopI18nService = inject(DesktopI18nService);

  public readonly saved = output<void>();

  public readonly micKey = signal<string | null>(null);
  public readonly speakerKey = signal<string | null>(null);
  public readonly autostart = signal<boolean>(false);
  public readonly nativeHotkeys = signal<boolean>(false);

  public readonly micError = signal<string>('');
  public readonly micHint = signal<string>('');
  public readonly speakerError = signal<string>('');
  public readonly speakerHint = signal<string>('');

  public readonly loading = signal<boolean>(false);
  public readonly saveMessage = signal<{
    variant: 'success' | 'error';
    text: string;
  } | null>(null);

  public readonly hotkeysHintKey = computed(() => {
    return this.nativeHotkeys()
      ? 'settings.hotkeysHint'
      : 'settings.hotkeysHintExclusive';
  });

  public async ngOnInit(): Promise<void> {
    try {
      const initial = await this.konvoezLocalBridge.settings.getInitial();
      if (initial.locale) {
        this.desktopI18nService.setLanguage(initial.locale);
      }
      this.micKey.set(initial.hotkeys.toggleMic);
      this.speakerKey.set(initial.hotkeys.toggleSpeaker);
      this.autostart.set(initial.autostart);
      this.nativeHotkeys.set(initial.nativeHotkeys);
    } catch {
      // defaults
    }
  }

  public async handleSave(): Promise<void> {
    if (this.loading()) return;
    this.loading.set(true);
    this.saveMessage.set(null);
    this.micError.set('');
    this.micHint.set('');
    this.speakerError.set('');
    this.speakerHint.set('');

    const hotkeys: TDesktopHotkeys = {
      toggleMic: this.micKey(),
      toggleSpeaker: this.speakerKey(),
    };

    try {
      const res = await this.konvoezLocalBridge.settings.save({
        hotkeys,
        autostart: this.autostart(),
      });
      this.loading.set(false);

      const micMapped = this.mapHotkeyStatus(res.hotkeys.toggleMic);
      this.micError.set(micMapped.error);
      this.micHint.set(micMapped.hint);

      const speakerMapped = this.mapHotkeyStatus(res.hotkeys.toggleSpeaker);
      this.speakerError.set(speakerMapped.error);
      this.speakerHint.set(speakerMapped.hint);

      if (micMapped.error || speakerMapped.error) return;

      this.saveMessage.set({
        variant: 'success',
        text: this.desktopI18nService.translate('settings.saved'),
      });
      this.saved.emit();
    } catch {
      this.loading.set(false);
      this.saveMessage.set({
        variant: 'error',
        text: this.desktopI18nService.translate('settings.saveFailed'),
      });
    }
  }

  protected handleRecordingStart(): void {
    this.konvoezLocalBridge.settings.suspendHotkeys();
  }

  protected handleRecordingStop(): void {
    this.konvoezLocalBridge.settings.resumeHotkeys();
  }

  private mapHotkeyStatus(status: THotkeyStatus): {
    error: string;
    hint: string;
  } {
    if (status === 'conflict' || status === 'invalid') {
      return {
        error: this.desktopI18nService.translate(`hotkeys.${status}`),
        hint: '',
      };
    }
    if (status === 'ok' || status === 'unset') {
      return {
        error: '',
        hint: this.desktopI18nService.translate(`hotkeys.${status}`),
      };
    }
    return { error: '', hint: '' };
  }
}
