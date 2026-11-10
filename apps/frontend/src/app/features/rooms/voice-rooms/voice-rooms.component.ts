import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  ActivatedRoute,
  NavigationEnd,
  Router,
  RouterOutlet,
} from '@angular/router';
import { filter } from 'rxjs/operators';
import { TranslatePipe } from '@ngx-translate/core';
import { TuiButton, TuiHint, TuiIcon, TuiTitle } from '@taiga-ui/core';
import { TuiHeader } from '@taiga-ui/layout';
import { ERoomType } from '@konvoez/shared';
import { LayoutService } from '@core/services/layout.service';
import { RoomManageService } from '../room-manage.service';
import { RoomListComponent } from '../room-list/room-list.component';
import { RoutePageComponent } from '@shared/components/route-page/route-page.component';
import { icons } from '@constants';

@Component({
  selector: 'app-voice-rooms',
  imports: [
    RouterOutlet,
    TranslatePipe,
    TuiButton,
    TuiHint,
    TuiIcon,
    TuiTitle,
    TuiHeader,
    RoomListComponent,
    RoutePageComponent,
  ],
  templateUrl: './voice-rooms.component.html',
  styleUrl: './voice-rooms.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VoiceRoomsComponent {
  private readonly router = inject(Router);
  private readonly activatedRoute = inject(ActivatedRoute);
  private readonly roomManageService = inject(RoomManageService);
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
  protected readonly canManageRooms = this.roomManageService.canManageRooms;
  protected readonly ERoomType = ERoomType;

  protected createRoom(): Promise<void> {
    return this.roomManageService.createRoom(ERoomType.VOICE);
  }
}
