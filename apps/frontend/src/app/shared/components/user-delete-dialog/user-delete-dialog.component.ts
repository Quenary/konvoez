import { ChangeDetectionStrategy, Component } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { injectContext } from '@taiga-ui/polymorpheus';
import { TuiCheckbox } from '@taiga-ui/core/components/checkbox';
import { TuiButton, TuiDialogContext, TuiIcon, TuiLabel } from '@taiga-ui/core';
import { TuiTooltip } from '@taiga-ui/kit';

export interface IUserDeleteDialogResult {
  readonly fullDeletion: boolean;
}

@Component({
  selector: 'app-user-delete-dialog',
  imports: [
    ReactiveFormsModule,
    TranslatePipe,
    TuiButton,
    TuiCheckbox,
    TuiIcon,
    TuiLabel,
    TuiTooltip,
  ],
  templateUrl: './user-delete-dialog.component.html',
  styleUrl: './user-delete-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserDeleteDialogComponent {
  public readonly context =
    injectContext<TuiDialogContext<IUserDeleteDialogResult | null, void>>();

  protected readonly fullDeletion = new FormControl(false, {
    nonNullable: true,
  });

  protected confirm(): void {
    this.context.completeWith({
      fullDeletion: this.fullDeletion.value,
    });
  }

  protected cancel(): void {
    this.context.completeWith(null);
  }
}
