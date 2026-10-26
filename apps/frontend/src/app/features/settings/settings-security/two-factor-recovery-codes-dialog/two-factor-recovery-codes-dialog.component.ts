import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { injectContext } from '@taiga-ui/polymorpheus';
import {
  TuiButton,
  TuiCheckbox,
  TuiDialogContext,
  TuiIcon,
  TuiLabel,
} from '@taiga-ui/core';
import { DownloadService } from '@core/services/download.service';
import { icons } from '@constants';

export interface ITwoFactorRecoveryCodesDialogData {
  readonly recoveryCodes: string[];
}

@Component({
  selector: 'app-two-factor-recovery-codes-dialog',
  imports: [
    FormsModule,
    TranslatePipe,
    TuiButton,
    TuiCheckbox,
    TuiIcon,
    TuiLabel,
  ],
  templateUrl: './two-factor-recovery-codes-dialog.component.html',
  styleUrl: './two-factor-recovery-codes-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TwoFactorRecoveryCodesDialogComponent {
  public readonly context =
    injectContext<TuiDialogContext<void, ITwoFactorRecoveryCodesDialogData>>();

  private readonly downloadService = inject(DownloadService);

  protected readonly icons = icons;
  protected readonly saved = signal(false);
  protected readonly codes = computed(
    () => this.context.data.recoveryCodes ?? [],
  );

  protected readonly codesString = computed(() => this.codes().join('\n'));

  protected copyCodes(): void {
    void navigator.clipboard.writeText(this.codesString());
  }

  protected downloadTxt(): void {
    const header =
      'Konvoez Two-Factor Authentication Recovery Codes\n' +
      `Generated: ${new Date().toISOString()}\n\n` +
      'Keep these codes in a safe place. Each code can be used only once.\n\n';
    const blob = new Blob([header + this.codesString()], {
      type: 'text/plain;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    this.downloadService.downloadUrl(url, 'konvoez-recovery-codes.txt');
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 5000);
  }

  protected onClose(): void {
    if (!this.saved()) {
      return;
    }
    this.context.completeWith();
  }
}
