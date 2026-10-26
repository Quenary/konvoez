import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  Injector,
} from '@angular/core';
import { Store } from '@ngrx/store';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { TuiButton, TuiIcon, TuiScrollbar } from '@taiga-ui/core';
import { TuiResponsiveDialogService } from '@taiga-ui/addon-mobile';
import { TuiBadge } from '@taiga-ui/kit';
import { TuiCardLarge, TuiHeader } from '@taiga-ui/layout';
import { PolymorpheusComponent } from '@taiga-ui/polymorpheus';
import { AuthActions } from '@core/auth/auth.actions';
import { selectCurrentUser } from '@core/auth/auth.selectors';
import { icons } from '@constants';
import { TwoFactorSetupDialogComponent } from './two-factor-setup-dialog/two-factor-setup-dialog.component';
import {
  ITwoFactorRecoveryCodesDialogData,
  TwoFactorRecoveryCodesDialogComponent,
} from './two-factor-recovery-codes-dialog/two-factor-recovery-codes-dialog.component';
import {
  ITwoFactorConfirmDialogData,
  TwoFactorConfirmDialogComponent,
} from './two-factor-confirm-dialog/two-factor-confirm-dialog.component';

@Component({
  selector: 'app-settings-security',
  imports: [
    TranslatePipe,
    TuiBadge,
    TuiButton,
    TuiCardLarge,
    TuiHeader,
    TuiIcon,
    TuiScrollbar,
  ],
  templateUrl: './settings-security.component.html',
  styleUrl: './settings-security.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsSecurityComponent {
  private readonly store = inject(Store);
  private readonly injector = inject(Injector);
  private readonly dialogService = inject(TuiResponsiveDialogService);
  private readonly translateService = inject(TranslateService);

  protected readonly icons = icons;
  protected readonly currentUser = this.store.selectSignal(selectCurrentUser);
  protected readonly twoFactorEnabled = computed(
    () => !!this.currentUser()?.twoFactorEnabled,
  );

  protected openSetup(): void {
    this.dialogService
      .open<string[] | null>(
        new PolymorpheusComponent(TwoFactorSetupDialogComponent, this.injector),
        {
          label: this.translateService.instant(
            'SETTINGS.SECURITY.TWO_FACTOR.TITLE',
          ),
          size: 'm',
        },
      )
      .subscribe((recoveryCodes) => {
        if (recoveryCodes && recoveryCodes.length > 0) {
          this.store.dispatch(
            AuthActions.setTwoFactorEnabled({ enabled: true }),
          );
          this.openRecoveryCodes(recoveryCodes);
        }
      });
  }

  protected openRecoveryCodes(recoveryCodes: string[]): void {
    this.dialogService
      .open<void>(
        new PolymorpheusComponent(
          TwoFactorRecoveryCodesDialogComponent,
          this.injector,
        ),
        {
          label: this.translateService.instant(
            'SETTINGS.SECURITY.TWO_FACTOR.RECOVERY.TITLE',
          ),
          size: 'm',
          data: { recoveryCodes } satisfies ITwoFactorRecoveryCodesDialogData,
          dismissible: false,
        },
      )
      .subscribe();
  }

  protected openDisable(): void {
    this.dialogService
      .open<boolean | null>(
        new PolymorpheusComponent(
          TwoFactorConfirmDialogComponent,
          this.injector,
        ),
        {
          label: this.translateService.instant(
            'SETTINGS.SECURITY.TWO_FACTOR.DISABLE',
          ),
          size: 's',
          data: { action: 'disable' } satisfies ITwoFactorConfirmDialogData,
        },
      )
      .subscribe((confirmed) => {
        if (confirmed) {
          this.store.dispatch(
            AuthActions.setTwoFactorEnabled({ enabled: false }),
          );
        }
      });
  }

  protected openRegenerate(): void {
    this.dialogService
      .open<string[] | null>(
        new PolymorpheusComponent(
          TwoFactorConfirmDialogComponent,
          this.injector,
        ),
        {
          label: this.translateService.instant(
            'SETTINGS.SECURITY.TWO_FACTOR.REGENERATE',
          ),
          size: 's',
          data: {
            action: 'regenerate',
          } satisfies ITwoFactorConfirmDialogData,
        },
      )
      .subscribe((newCodes) => {
        if (newCodes && newCodes.length > 0) {
          this.openRecoveryCodes(newCodes);
        }
      });
  }
}
