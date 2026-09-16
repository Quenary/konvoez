import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  resource,
} from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { IInvite, TInviteStatus } from '@konvoez/shared';
import { TuiTable } from '@taiga-ui/addon-table';
import {
  TuiButton,
  TuiDialogService,
  TuiIcon,
  TuiNotificationService,
  TuiTitle,
} from '@taiga-ui/core';
import { TuiCardLarge, TuiHeader } from '@taiga-ui/layout';
import { TuiAutoColorPipe, TuiProgressCircle, TuiTooltip } from '@taiga-ui/kit';
import { PolymorpheusComponent } from '@taiga-ui/polymorpheus';
import { InvitesApiService } from './invites-api.service';
import { InviteCreateDialogComponent } from './invite-create-dialog/invite-create-dialog.component';
import { parseError } from '@shared/functions/parse-error.function';

export interface IInviteStatusData {
  readonly icon: string;
  readonly tooltip: string;
  readonly appearance: string;
}

export interface IInviteViewItem {
  readonly id: number;
  readonly email: string;
  readonly authorUsername: string;
  readonly usedByUsername: string | null;
  readonly status: TInviteStatus;
  readonly statusData: IInviteStatusData;
  readonly isActive: boolean;
  readonly progress: number;
  readonly progressColor: string;
  readonly remainingText: string;
}

export const INVITE_STATUS_DATA: Record<TInviteStatus, IInviteStatusData> = {
  active: {
    icon: '@tui.circle-check',
    tooltip: 'SETTINGS.INVITES.STATUS.ACTIVE',
    appearance: 'positive',
  },
  used: {
    icon: '@tui.user-check',
    tooltip: 'SETTINGS.INVITES.STATUS.USED',
    appearance: 'info',
  },
  revoked: {
    icon: '@tui.ban',
    tooltip: 'SETTINGS.INVITES.STATUS.REVOKED',
    appearance: 'negative',
  },
  expired: {
    icon: '@tui.clock',
    tooltip: 'SETTINGS.INVITES.STATUS.EXPIRED',
    appearance: 'warning',
  },
};

@Component({
  selector: 'app-settings-invites',
  imports: [
    TranslatePipe,
    TuiAutoColorPipe,
    TuiButton,
    TuiCardLarge,
    TuiHeader,
    TuiIcon,
    TuiProgressCircle,
    TuiTable,
    TuiTooltip,
    TuiTitle,
  ],
  templateUrl: './settings-invites.component.html',
  styleUrl: './settings-invites.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsInvitesComponent {
  private readonly invitesApiService = inject(InvitesApiService);
  private readonly dialogService = inject(TuiDialogService);
  private readonly translateService = inject(TranslateService);
  private readonly notificationService = inject(TuiNotificationService);

  protected readonly statusData = INVITE_STATUS_DATA;

  protected readonly invitesResource = resource({
    loader: () =>
      firstValueFrom(this.invitesApiService.list()).catch((err) => {
        this.notificationService
          .open(parseError(err), {
            appearance: 'negative',
            label: this.translateService.instant('GENERAL.REQ_ERR'),
          })
          .subscribe();
        return [] as IInvite[];
      }),
    defaultValue: [] as IInvite[],
  });

  protected readonly invites = computed<IInviteViewItem[]>(() => {
    const now = Date.now();
    return this.invitesResource.value().map((invite) => {
      const created = new Date(invite.createdAt).getTime();
      const expires = new Date(invite.expiresAt).getTime();
      const total = expires - created;
      const diff = expires - now;
      const progress =
        total <= 0
          ? 0
          : Math.max(0, Math.min(100, Math.round((diff / total) * 100)));

      let progressColor = 'var(--tui-status-positive)';
      if (progress < 25) {
        progressColor = 'var(--tui-status-negative)';
      } else if (progress < 50) {
        progressColor = 'var(--tui-status-warning)';
      }

      let remainingText = '0m';
      if (diff > 0) {
        const minutes = Math.floor(diff / 60_000);
        const hours = Math.floor(minutes / 60);
        remainingText =
          hours > 0 ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
      }

      return {
        id: invite.id,
        email: invite.email ?? '',
        authorUsername: invite.author.username,
        usedByUsername: invite.usedBy?.username ?? null,
        status: invite.status,
        statusData: this.statusData[invite.status],
        isActive: invite.status === 'active',
        progress,
        progressColor,
        remainingText,
      };
    });
  });

  protected openCreateDialog(): void {
    this.dialogService
      .open<IInvite | null>(
        new PolymorpheusComponent(InviteCreateDialogComponent),
        {
          label: this.translateService.instant('SETTINGS.INVITES.CREATE_TITLE'),
          size: 'm',
        },
      )
      .subscribe((res) => {
        if (res) {
          this.invitesResource.reload();
        }
      });
  }

  protected revoke(id: number): void {
    this.invitesApiService.revoke(id).subscribe({
      next: () => {
        this.invitesResource.reload();
      },
      error: (err) => {
        this.notificationService
          .open(parseError(err), {
            appearance: 'negative',
            label: this.translateService.instant('GENERAL.REQ_ERR'),
          })
          .subscribe();
      },
    });
  }

  protected delete(id: number): void {
    this.invitesApiService.delete(id).subscribe({
      next: () => {
        this.invitesResource.reload();
      },
      error: (err) => {
        this.notificationService
          .open(parseError(err), {
            appearance: 'negative',
            label: this.translateService.instant('GENERAL.REQ_ERR'),
          })
          .subscribe();
      },
    });
  }
}
