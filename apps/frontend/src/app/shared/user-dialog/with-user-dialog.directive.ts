import { Directive, input, inject } from '@angular/core';
import { IUser } from '@konvoez/shared';
import { UserDialogService } from '@shared/user-dialog/user-dialog.service';

@Directive({
  selector: '[appWithUserDialog]',
  host: {
    '[style.cursor]': "'pointer'",
    '(click)': 'openDialog()',
  },
})
export class WithUserDialogDirective {
  private readonly userDialogService = inject(UserDialogService);

  public readonly appWithUserDialog = input.required<
    IUser | null | undefined
  >();

  protected openDialog(): void {
    void this.userDialogService.open(this.appWithUserDialog());
  }
}
