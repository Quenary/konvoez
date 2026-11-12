import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  OnInit,
  computed,
  inject,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
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
import { normalizeServerOrigin } from '@konvoez/client-shell';
import { KONVOEZ_LOCAL_BRIDGE } from '../../app.config';
import { DialogLayoutComponent } from '../../components/dialog-layout/dialog-layout.component';
import { DesktopI18nService } from '../../core/i18n/desktop-i18n.service';
import { I18nPipe } from '../../core/i18n/i18n.pipe';
import { readSavedServers, writeSavedServers } from './saved-servers';

@Component({
  selector: 'app-server-dialog',
  imports: [
    DialogLayoutComponent,
    FormsModule,
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
  private readonly destroyRef = inject(DestroyRef);

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
    const servers = readSavedServers(localStorage);
    this.savedServers.set(servers);
    writeSavedServers(localStorage, servers);
    try {
      const initial = await this.konvoezLocalBridge.server.getInitial();
      if (initial.locale) {
        this.desktopI18nService.setLanguage(initial.locale);
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
      this.error.set(this.serverErrorMessage(err));
    }
  }

  protected handleAdd(): void {
    const url = this.serverUrl().trim();
    if (!url || this.loading()) return;

    let origin: string;
    try {
      origin = normalizeServerOrigin(url);
    } catch (err: unknown) {
      this.error.set(this.serverErrorMessage(err));
      return;
    }

    this.error.set('');
    if (this.savedServers().includes(origin)) return;
    this.persistServers([origin, ...this.savedServers()]);
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
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((confirmed) => {
        if (!confirmed) return;
        this.persistServers(
          this.savedServers().filter((item) => item !== origin),
        );
      });
  }

  protected clearUrlError(): void {
    this.error.set('');
  }

  private persistServers(servers: readonly string[]): void {
    this.savedServers.set(servers);
    writeSavedServers(localStorage, servers);
  }

  private serverErrorMessage(err: unknown): string {
    const errMsg = err instanceof Error ? err.message : String(err);
    if (errMsg.includes('INSECURE')) {
      return this.desktopI18nService.translate('server.errorInsecure');
    }
    if (errMsg.includes('INVALID_URL') || errMsg.includes('INVALID_RESPONSE')) {
      return this.desktopI18nService.translate('server.errorInvalid');
    }
    return this.desktopI18nService.translate('server.errorUnreachable');
  }
}
