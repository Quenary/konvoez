import { inject, Injectable, Injector } from '@angular/core';
import { selectCurrentUser } from '@core/auth/auth.selectors';
import { IUser } from '@konvoez/shared';
import { Store } from '@ngrx/store';
import { TuiDialogService } from '@taiga-ui/core';
import { PolymorpheusComponent } from '@taiga-ui/polymorpheus';
import type { IUserDialogData } from './user-dialog.component';

@Injectable({
  providedIn: 'root',
})
export class UserDialogService {
  private readonly dialogService = inject(TuiDialogService);
  private readonly injector = inject(Injector);
  private readonly store = inject(Store);

  private readonly currentUser = this.store.selectSignal(selectCurrentUser);

  public async open(user: IUser | null | undefined): Promise<void> {
    if (!user || user.id === this.currentUser()?.id) {
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
