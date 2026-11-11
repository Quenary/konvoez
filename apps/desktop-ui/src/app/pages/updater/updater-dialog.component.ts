import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { TuiButton } from '@taiga-ui/core';
import { TuiProgressBar } from '@taiga-ui/kit';
import type { IUpdaterProgress, IUpdaterState } from '@konvoez/client-shell';
import { KONVOEZ_LOCAL_BRIDGE } from '../../core/tokens/local-bridge.token';
import { DesktopI18nService } from '../../core/i18n/desktop-i18n.service';
import { I18nPipe } from '../../core/i18n/i18n.pipe';
import { DialogLayoutComponent } from '../../components/dialog-layout/dialog-layout.component';

function formatProgressDetails(progress?: IUpdaterProgress): string {
  if (!progress) return '';
  const parts: string[] = [];
  if (
    progress.transferred !== undefined &&
    progress.total !== undefined &&
    progress.total > 0
  ) {
    const transferredMb = (progress.transferred / (1024 * 1024)).toFixed(1);
    const totalMb = (progress.total / (1024 * 1024)).toFixed(1);
    parts.push(`${transferredMb} / ${totalMb} MB`);
  }
  if (progress.bytesPerSecond !== undefined && progress.bytesPerSecond > 0) {
    if (progress.bytesPerSecond >= 1024 * 1024) {
      const speedMb = (progress.bytesPerSecond / (1024 * 1024)).toFixed(1);
      parts.push(`${speedMb} MB/s`);
    } else {
      const speedKb = (progress.bytesPerSecond / 1024).toFixed(0);
      parts.push(`${speedKb} KB/s`);
    }
  }
  return parts.join(' • ');
}

@Component({
  selector: 'app-updater-dialog',
  imports: [DialogLayoutComponent, I18nPipe, TuiButton, TuiProgressBar],
  templateUrl: './updater-dialog.component.html',
  styleUrl: './updater-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UpdaterDialogComponent implements OnInit, OnDestroy {
  private readonly konvoezLocalBridge = inject(KONVOEZ_LOCAL_BRIDGE);
  private readonly desktopI18nService = inject(DesktopI18nService);

  public readonly updaterState = signal<IUpdaterState>({ status: 'checking' });
  public readonly progressDetails = computed(() => {
    return formatProgressDetails(this.updaterState().progress);
  });

  private unsubscribeState: (() => void) | null = null;

  public async ngOnInit(): Promise<void> {
    try {
      const initial = await this.konvoezLocalBridge.updater.getInitial();
      if (initial.locale) {
        this.desktopI18nService.setLanguage(initial.locale);
      }
      if (initial.state) {
        this.updaterState.set(initial.state);
      }
      this.unsubscribeState?.();
      this.unsubscribeState = this.konvoezLocalBridge.updater.onState(
        (state) => {
          this.updaterState.set(state);
        },
      );
    } catch {
      // defaults
    }
  }

  public ngOnDestroy(): void {
    if (this.unsubscribeState) {
      this.unsubscribeState();
      this.unsubscribeState = null;
    }
  }

  public handleClose(): void {
    this.konvoezLocalBridge.updater.later();
  }

  public handleDownload(): void {
    this.konvoezLocalBridge.updater.download();
  }

  public handleLater(): void {
    this.konvoezLocalBridge.updater.later();
  }

  public handleRestart(): void {
    this.konvoezLocalBridge.updater.restart();
  }

  public handleRetry(): void {
    this.konvoezLocalBridge.updater.retry();
  }
}
