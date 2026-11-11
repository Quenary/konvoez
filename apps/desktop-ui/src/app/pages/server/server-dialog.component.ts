import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnInit,
  computed,
  inject,
  output,
  signal,
  viewChild,
} from '@angular/core';
import {
  TuiButton,
  TuiDialogService,
  TuiHint,
  TuiInput,
  TuiLabel,
  TuiLoader,
  TuiNotification,
  TuiTextfield,
  TuiTitle,
} from '@taiga-ui/core';
import { TUI_CONFIRM, type TuiConfirmData } from '@taiga-ui/kit';
import { KONVOEZ_LOCAL_BRIDGE } from '../../app.config';
import { DialogLayoutComponent } from '../../components/dialog-layout/dialog-layout.component';
import { DesktopI18nService } from '../../core/i18n/desktop-i18n.service';
import { I18nPipe } from '../../core/i18n/i18n.pipe';
import { readSavedServers, writeSavedServers } from './saved-servers';

@Component({
  selector: 'app-server-dialog',
  imports: [
    DialogLayoutComponent,
    I18nPipe,
    TuiButton,
    TuiHint,
    TuiInput,
    TuiLabel,
    TuiLoader,
    TuiNotification,
    TuiTextfield,
    TuiTitle,
  ],
  templateUrl: './server-dialog.component.html',
  styleUrl: './server-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ServerDialogComponent implements OnInit {
  private readonly konvoezLocalBridge = inject(KONVOEZ_LOCAL_BRIDGE);
  private readonly desktopI18nService = inject(DesktopI18nService);
  private readonly tuiDialogService = inject(TuiDialogService);

  public readonly done = output<{ origin: string }>();

  public readonly serverUrl = signal<string>('');
  public readonly savedServers = signal<readonly string[]>([]);
  public readonly loading = signal<boolean>(false);
  public readonly error = signal<string>('');
  public readonly canAdd = computed(() => {
    const url = this.serverUrl();
    const loading = this.loading();
    return url.trim().length > 0 && !loading;
  });

  private readonly inputEl = viewChild<ElementRef<HTMLInputElement>>('inputEl');

  public async ngOnInit(): Promise<void> {
    this.savedServers.set(readSavedServers(localStorage));
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

  public async handleConnect(rawUrl?: string): Promise<void> {
    if (this.loading()) return;

    const url = (rawUrl ?? this.serverUrl()).trim();
    if (!url) {
      this.error.set(this.desktopI18nService.translate('server.errorInvalid'));
      return;
    }

    this.loading.set(true);
    this.error.set('');

    try {
      const res = await this.konvoezLocalBridge.server.saveServer(url);
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

  protected handleAdd(): void {
    const url = this.serverUrl().trim();
    if (!url || this.savedServers().includes(url)) return;
    this.persistServers([url, ...this.savedServers()]);
  }

  protected handleRemove(origin: string): void {
    this.tuiDialogService
      .open<boolean>(TUI_CONFIRM, {
        label: this.desktopI18nService.translate('server.removeConfirm'),
        data: {
          yes: this.desktopI18nService.translate('server.removeYes'),
          no: this.desktopI18nService.translate('server.removeNo'),
          appearance: 'negative',
        } satisfies TuiConfirmData,
      })
      .subscribe((confirmed) => {
        if (!confirmed) return;
        this.persistServers(
          this.savedServers().filter((item) => item !== origin),
        );
      });
  }

  protected onUrlInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.serverUrl.set(input.value);
    this.error.set('');
  }

  private persistServers(servers: readonly string[]): void {
    this.savedServers.set(servers);
    writeSavedServers(localStorage, servers);
  }
}
