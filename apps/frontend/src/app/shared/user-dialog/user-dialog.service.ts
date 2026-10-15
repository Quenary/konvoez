import { inject, Injectable, Injector } from '@angular/core';
import { IUser } from '@konvoez/shared';
import { TuiDialogService } from '@taiga-ui/core';
import { PolymorpheusComponent } from '@taiga-ui/polymorpheus';
import type { IUserDialogData } from './user-dialog.component';

@Injectable({
  providedIn: 'root',
})
export class UserDialogService {
  private readonly dialogService = inject(TuiDialogService);
  private readonly injector = inject(Injector);

  public async open(user: IUser | null | undefined): Promise<void> {
    if (!user) {
      return;
    }

    const { UserDialogComponent } = await import('./user-dialog.component');

    this.dialogService
      .open<IUserDialogData>(
        new PolymorpheusComponent(UserDialogComponent, this.injector),
        {
          size: 's',
          data: { user },
        },
      )
      .subscribe();
  }
}
