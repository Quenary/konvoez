import { Location } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
} from '@angular/core';
import { Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { TuiButton } from '@taiga-ui/core';
import { LayoutService } from '@core/services/layout.service';
import { icons } from '@constants';

@Component({
  selector: 'app-header-back-button',
  imports: [TranslatePipe, TuiButton],
  template: `
    @if (isNarrow()) {
      <button
        tuiIconButton
        appearance="flat"
        size="s"
        type="button"
        [iconStart]="icons['chevron-left']"
        [attr.aria-label]="'GENERAL.GO_BACK' | translate"
        (click)="navigateBack()"></button>
    }
  `,
  styles: `
    :host {
      display: contents;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HeaderBackButtonComponent {
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly layoutService = inject(LayoutService);

  public readonly to = input<string | unknown[]>('/settings');

  protected readonly icons = icons;
  protected readonly isNarrow = this.layoutService.isNarrow;

  protected navigateBack(): void {
    if (this.navigationId() > 1) {
      this.location.back();
      return;
    }

    const dest = this.to();
    void this.router.navigate(Array.isArray(dest) ? dest : [dest]);
  }

  private navigationId(): number {
    const state = this.location.getState();
    if (
      typeof state !== 'object' ||
      state === null ||
      !('navigationId' in state) ||
      typeof state.navigationId !== 'number'
    ) {
      return 0;
    }
    return state.navigationId;
  }
}
