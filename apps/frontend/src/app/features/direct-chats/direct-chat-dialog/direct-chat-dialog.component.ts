import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
} from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { injectContext } from '@taiga-ui/polymorpheus';
import {
  TuiButton,
  TuiDialogContext,
  TuiInput,
  TuiScrollbar,
  TuiTextfield,
} from '@taiga-ui/core';
import { TuiAutoFocus } from '@taiga-ui/cdk';
import { Store } from '@ngrx/store';
import { selectCurrentUser } from '@features/auth/auth.selectors';
import { UsersStore } from '@features/users/users.store';
import { IUser } from '@konvoez/shared';
import { toSignal } from '@angular/core/rxjs-interop';
import { DirectChatItemComponent } from '../direct-chat-item/direct-chat-item.component';

@Component({
  selector: 'app-direct-chat-dialog',
  imports: [
    ReactiveFormsModule,
    TranslatePipe,
    TuiButton,
    TuiTextfield,
    TuiInput,
    TuiAutoFocus,
    TuiScrollbar,
    DirectChatItemComponent,
  ],
  templateUrl: './direct-chat-dialog.component.html',
  styleUrl: './direct-chat-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DirectChatDialogComponent implements OnInit {
  public readonly context =
    injectContext<TuiDialogContext<IUser | null, void>>();
  private readonly usersStore = inject(UsersStore);
  private readonly ngrxStore = inject(Store);

  private readonly currentUser = this.ngrxStore.selectSignal(selectCurrentUser);

  protected readonly searchControl = new FormControl('', {
    nonNullable: true,
  });
  private readonly searchQuery = toSignal(this.searchControl.valueChanges, {
    initialValue: '',
  });

  protected readonly filteredUsers = computed(() => {
    const query = this.searchQuery().trim().toLowerCase();
    const currentUserId = this.currentUser()?.id;
    const allUsers = this.usersStore.entities();

    return allUsers.filter((user) => {
      if (user.id === currentUserId) {
        return false;
      }
      if (!query) {
        return true;
      }
      return (
        user.username.toLowerCase().includes(query) ||
        user.fullname.toLowerCase().includes(query)
      );
    });
  });

  ngOnInit(): void {
    this.usersStore.loadAll();
  }

  protected selectUser(user: IUser): void {
    this.context.completeWith(user);
  }

  protected close(): void {
    this.context.completeWith(null);
  }
}
