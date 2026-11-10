import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  OnInit,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { TuiButton, TuiHint, TuiIcon } from '@taiga-ui/core';
import {
  TuiAutoColorPipe,
  TuiBadgedContent,
  TuiBadgeNotification,
} from '@taiga-ui/kit';
import { TuiNavigation } from '@taiga-ui/layout';
import { ERoomType, IUserSafe } from '@konvoez/shared';
import { RoomsStore } from '@core/stores/rooms.store';
import { DirectCallService } from '@core/services/direct-call.service';
import { UnreadCountsStore } from '@core/chat/unread-counts.store';
import { UsersStore } from '@core/stores/users.store';
import { UserAvatarComponent } from '@shared/components/user-avatar/user-avatar.component';
import { PulseIndicatorComponent } from '@shared/components/pulse-indicator/pulse-indicator.component';
import { RoomManageService } from './room-manage.service';
import { RoomAsideListComponent } from './room-aside-list/room-aside-list.component';
import { icons } from '@constants';

@Component({
  selector: 'app-rooms',
  host: {
    '[class.collapsed]': 'collapsed()',
  },
  imports: [
    NgTemplateOutlet,
    RouterLink,
    RouterLinkActive,
    TranslatePipe,
    RoomAsideListComponent,
    UserAvatarComponent,
    PulseIndicatorComponent,
    TuiAutoColorPipe,
    TuiBadgedContent,
    TuiBadgeNotification,
    TuiButton,
    TuiHint,
    TuiIcon,
    TuiNavigation,
  ],
  templateUrl: './rooms.component.html',
  styleUrl: './rooms.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RoomsComponent implements OnInit {
  private readonly roomsStore = inject(RoomsStore);
  private readonly usersStore = inject(UsersStore);
  private readonly directCallService = inject(DirectCallService);
  private readonly router = inject(Router);
  private readonly roomManageService = inject(RoomManageService);
  protected readonly unreadCountsStore = inject(UnreadCountsStore);

  public readonly collapsed = input.required<boolean>();

  protected readonly icons = icons;
  protected readonly ERoomType = ERoomType;
  protected readonly canManageRooms = this.roomManageService.canManageRooms;

  protected readonly hangingCallPeer = computed(() => {
    const userId = this.directCallService.hangingCallUserId();
    const users = this.usersStore.entityMap();
    const interlocutor = this.directCallService.interlocutor();
    if (userId === null) {
      return null;
    }
    return users[userId] ?? (interlocutor?.id === userId ? interlocutor : null);
  });

  ngOnInit(): void {
    this.roomsStore.loadAll();
    this.usersStore.loadAll();
  }

  public addRoom(type: ERoomType): Promise<void> {
    return this.roomManageService.createRoom(type);
  }

  protected openHangingCall(peer: IUserSafe): void {
    void this.router.navigate(['/direct', peer.id]);
  }
}
