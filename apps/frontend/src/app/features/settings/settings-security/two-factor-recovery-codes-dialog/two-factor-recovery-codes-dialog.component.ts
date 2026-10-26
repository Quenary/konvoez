import {
  ChangeDetectionStrategy,
  Component,
  computed,
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
  protected readonly icons = icons;
  public readonly context =
    injectContext<TuiDialogContext<void, ITwoFactorRecoveryCodesDialogData>>();

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
    const link = document.createElement('a');
    link.href = url;
    link.download = 'konvoez-recovery-codes.txt';
    link.click();
    URL.revokeObjectURL(url);
  }

  protected onClose(): void {
    if (!this.saved()) {
      return;
    }
    this.context.completeWith();
  }
}
