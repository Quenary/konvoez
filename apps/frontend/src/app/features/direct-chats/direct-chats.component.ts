import {
  ChangeDetectionStrategy,
  Component,
  inject,
  Injector,
  OnInit,
} from '@angular/core';
import { Router } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { PolymorpheusComponent } from '@taiga-ui/polymorpheus';
import {
  TuiButton,
  TuiDialogService,
  TuiIcon,
  TuiScrollbar,
  TuiTitle,
} from '@taiga-ui/core';
import { TuiCard, TuiHeader } from '@taiga-ui/layout';
import { DirectChatsStore } from './direct-chats.store';
import { DirectChatItemComponent } from './direct-chat-item/direct-chat-item.component';
import { UsersStore } from '@features/users/users.store';
import { IUser } from '@konvoez/shared';

@Component({
  selector: 'app-direct-chats',
  imports: [
    TranslatePipe,
    TuiButton,
    TuiIcon,
    TuiHeader,
    TuiTitle,
    TuiScrollbar,
    TuiCard,
    DirectChatItemComponent,
  ],
  templateUrl: './direct-chats.component.html',
  styleUrl: './direct-chats.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DirectChatsComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private readonly tuiDialogService = inject(TuiDialogService);
  private readonly translateService = inject(TranslateService);
  private readonly usersStore = inject(UsersStore);
  protected readonly directChatsStore = inject(DirectChatsStore);

  ngOnInit(): void {
    this.directChatsStore.loadDirectChats();
    this.usersStore.loadAll();
  }

  protected async openNewChatDialog(): Promise<void> {
    const { DirectChatDialogComponent } =
      await import('./direct-chat-dialog/direct-chat-dialog.component');

    this.tuiDialogService
      .open<IUser | null>(
        new PolymorpheusComponent(DirectChatDialogComponent, this.injector),
        {
          closable: true,
          label: this.translateService.instant('DIRECT.NEW_CHAT'),
        },
      )
      .subscribe((user) => {
        if (!user) return;
        this.directChatsStore.addOrUpdateChat(user);
        this.router.navigate(['/direct', user.id]);
      });
  }

  protected openChat(user: IUser): void {
    this.router.navigate(['/direct', user.id]);
  }
}
