import { inject, Injectable, Injector } from '@angular/core';
import { IUserSafe } from '@konvoez/shared';
import { TuiResponsiveDialogService } from '@taiga-ui/addon-mobile';
import { PolymorpheusComponent } from '@taiga-ui/polymorpheus';
import type {
  IUserDialogData,
  IUserDialogOptions,
} from './user-dialog.component';

@Injectable({
  providedIn: 'root',
})
export class UserDialogService {
  private readonly dialogService = inject(TuiResponsiveDialogService);
  private readonly injector = inject(Injector);

  public async open(
    user: IUserSafe | null | undefined,
    options: IUserDialogOptions = {},
  ): Promise<void> {
    if (!user) {
      return;
    }

    const { UserDialogComponent } = await import('./user-dialog.component');
    const data: IUserDialogData = {
      user,
      withFiles: options.withFiles ?? false,
      withInput: options.withInput ?? true,
    };

    this.dialogService
      .open<IUserDialogData>(
        new PolymorpheusComponent(UserDialogComponent, this.injector),
        {
          data,
        },
      )
      .subscribe();
  }
}
