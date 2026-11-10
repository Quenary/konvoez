import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  Injector,
  OnInit,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  ActivatedRoute,
  NavigationEnd,
  Router,
  RouterOutlet,
} from '@angular/router';
import { filter } from 'rxjs/operators';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { PolymorpheusComponent } from '@taiga-ui/polymorpheus';
import { TuiButton, TuiHint, TuiIcon, TuiTitle } from '@taiga-ui/core';
import { TuiHeader } from '@taiga-ui/layout';
import { DirectChatsStore } from './direct-chats.store';
import { DirectChatItemComponent } from './direct-chat-item/direct-chat-item.component';
import { UsersStore } from '@core/stores/users.store';
import { IUserSafe } from '@konvoez/shared';
import { TuiResponsiveDialogService } from '@taiga-ui/addon-mobile';
import { LayoutService } from '@core/services/layout.service';
import { RoutePageComponent } from '@shared/components/route-page/route-page.component';
import { icons } from '@constants';

@Component({
  selector: 'app-direct-chats',
  imports: [
    RouterOutlet,
    TranslatePipe,
    TuiButton,
    TuiIcon,
    TuiHeader,
    TuiTitle,
    DirectChatItemComponent,
    RoutePageComponent,
    TuiHint,
  ],
  templateUrl: './direct-chats.component.html',
  styleUrl: './direct-chats.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DirectChatsComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly activatedRoute = inject(ActivatedRoute);
  private readonly injector = inject(Injector);
  private readonly tuiRespectiveDialogService = inject(
    TuiResponsiveDialogService,
  );
  private readonly translateService = inject(TranslateService);
  private readonly usersStore = inject(UsersStore);
  protected readonly directChatsStore = inject(DirectChatsStore);
  private readonly layoutService = inject(LayoutService);

  private readonly navigationEnd = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
    ),
  );

  protected readonly hasChildRoute = computed(() => {
    this.navigationEnd();
    return Boolean(this.activatedRoute.firstChild);
  });

  protected readonly icons = icons;
  protected readonly isNarrow = this.layoutService.isNarrow;

  ngOnInit(): void {
    this.directChatsStore.loadDirectChats();
    this.usersStore.loadAll();
  }

  protected async openNewChatDialog(): Promise<void> {
    const { DirectChatDialogComponent } =
      await import('./direct-chat-dialog/direct-chat-dialog.component');

    this.tuiRespectiveDialogService
      .open<IUserSafe | null>(
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

  protected openChat(user: IUserSafe): void {
    this.router.navigate(['/direct', user.id]);
  }
}
