import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnInit,
  inject,
  output,
  signal,
  viewChild,
} from '@angular/core';
import {
  TuiButton,
  TuiInput,
  TuiLoader,
  TuiNotification,
  TuiTextfield,
} from '@taiga-ui/core';
import { KONVOEZ_LOCAL_BRIDGE } from '../../app.config';
import { DesktopI18nService } from '../../core/i18n/desktop-i18n.service';
import { I18nPipe } from '../../core/i18n/i18n.pipe';
import { DialogLayoutComponent } from '../../components/dialog-layout/dialog-layout.component';

@Component({
  selector: 'app-server-dialog',
  imports: [
    DialogLayoutComponent,
    I18nPipe,
    TuiButton,
    TuiInput,
    TuiLoader,
    TuiNotification,
    TuiTextfield,
  ],
  templateUrl: './server-dialog.component.html',
  styleUrl: './server-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ServerDialogComponent implements OnInit {
  private readonly konvoezLocalBridge = inject(KONVOEZ_LOCAL_BRIDGE);
  private readonly desktopI18nService = inject(DesktopI18nService);

  public readonly done = output<{ origin: string }>();

  public readonly serverUrl = signal<string>('');
  public readonly loading = signal<boolean>(false);
  public readonly error = signal<string>('');

  private readonly inputEl = viewChild<ElementRef<HTMLInputElement>>('inputEl');

  public async ngOnInit(): Promise<void> {
    try {
      const initial = await this.konvoezLocalBridge.server.getInitial();
      if (initial.locale) {
        this.desktopI18nService.setLanguage(initial.locale);
      }
      if (initial.serverOrigin) {
        this.serverUrl.set(initial.serverOrigin);
      }
      setTimeout(() => {
        this.inputEl()?.nativeElement.focus();
      });
    } catch {
      // defaults
    }
  }

  public async handleConnect(): Promise<void> {
    if (this.loading()) return;

    const rawUrl = this.serverUrl().trim();
    if (!rawUrl) {
      this.error.set(this.desktopI18nService.translate('server.errorInvalid'));
      return;
    }

    this.loading.set(true);
    this.error.set('');

    try {
      const res = await this.konvoezLocalBridge.server.saveServer(rawUrl);
      this.loading.set(false);
      this.done.emit({ origin: res.origin });
    } catch (err: unknown) {
      this.loading.set(false);
      const errMsg = err instanceof Error ? err.message : String(err);
      if (errMsg.includes('INSECURE')) {
        this.error.set(
          this.desktopI18nService.translate('server.errorInsecure'),
        );
      } else if (
        errMsg.includes('INVALID_URL') ||
        errMsg.includes('INVALID_RESPONSE')
      ) {
        this.error.set(
          this.desktopI18nService.translate('server.errorInvalid'),
        );
      } else {
        this.error.set(
          this.desktopI18nService.translate('server.errorUnreachable'),
        );
      }
    }
  }

  protected onUrlInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.serverUrl.set(input.value);
    this.error.set('');
  }
}
