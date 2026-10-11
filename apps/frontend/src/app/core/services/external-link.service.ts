import { inject, Injectable } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { TuiResponsiveDialogService } from '@taiga-ui/addon-mobile';
import { TUI_CONFIRM, type TuiConfirmData } from '@taiga-ui/kit';
import { finalize, take } from 'rxjs';

/** Handles external link clicks */
@Injectable({ providedIn: 'root' })
export class ExternalLinkService {
  private readonly tuiResponsiveDialogService = inject(
    TuiResponsiveDialogService,
  );
  private readonly translateService = inject(TranslateService);

  private dialogOpen = false;

  handleHtmlContentClick(
    event: MouseEvent,
    options?: { root?: HTMLElement | null },
  ): void {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    const eventTarget = event.target;
    if (!(eventTarget instanceof Element)) {
      return;
    }

    const anchor = eventTarget.closest('a[href]');
    if (!(anchor instanceof HTMLAnchorElement)) {
      return;
    }

    const root = options?.root;
    if (root && !root.contains(anchor)) {
      return;
    }

    const href = anchor.getAttribute('href');
    if (!href || href.startsWith('#')) {
      return;
    }

    if (anchor.getAttribute('data-type') === 'jump-anchor') {
      return;
    }

    const url = anchor.href;
    if (!this.isExternalHttpUrl(url)) {
      return;
    }

    event.preventDefault();
    this.openConfirmDialog(url);
  }

  private isExternalHttpUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return false;
      }
      return parsed.origin !== window.location.origin;
    } catch {
      return false;
    }
  }

  private openConfirmDialog(url: string): void {
    if (this.dialogOpen) {
      return;
    }
    this.dialogOpen = true;

    this.tuiResponsiveDialogService
      .open<boolean>(TUI_CONFIRM, {
        label: this.translateService.instant('EXTERNAL_LINK.TITLE'),
        size: 's',
        closable: true,
        dismissible: true,
        data: {
          content: this.translateService.instant('EXTERNAL_LINK.CONTENT', {
            url,
          }),
          yes: this.translateService.instant('EXTERNAL_LINK.ACTION'),
          no: this.translateService.instant('GENERAL.CANCEL'),
        } satisfies TuiConfirmData,
      })
      .pipe(
        take(1),
        finalize(() => {
          this.dialogOpen = false;
        }),
      )
      .subscribe({
        next: (confirmed) => {
          if (confirmed) {
            window.open(url, '_blank', 'noopener,noreferrer');
          }
        },
      });
  }
}
