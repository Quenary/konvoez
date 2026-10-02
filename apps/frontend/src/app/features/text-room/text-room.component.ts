import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { finalize } from 'rxjs';
import { Store } from '@ngrx/store';
import { RoomsActions } from '../rooms/rooms.actions';
import { selectRoomsDict } from '../rooms/rooms.selectors';
import { RoomContextMenuComponent } from '../rooms/room-context-menu/room-context-menu.component';
import { RoomManageService } from '../rooms/room-manage.service';
import { IRoom } from '../rooms/rooms.interface';
import { UsersStore } from '../users/users.store';
import { TextRoomEditorComponent } from './text-room-editor/text-room-editor.component';
import { TextRoomListComponent } from './text-room-list/text-room-list.component';
import { TextRoomStore } from './text-room.store';
import {
  TuiButton,
  TuiDropdown,
  TuiHint,
  TuiInput,
  TuiTextfield,
  TuiTitle,
} from '@taiga-ui/core';
import { TuiHeader } from '@taiga-ui/layout';
import { TuiAutoFocus } from '@taiga-ui/cdk';
import { TuiAvatar, TuiInitialsPipe } from '@taiga-ui/kit';
import { NgOptimizedImage } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { TranslatePipe } from '@ngx-translate/core';
import { DirectCallPanelComponent } from '@shared/components/voice-room/direct-call-panel/direct-call-panel.component';
import { PulseIndicatorComponent } from '@shared/components/pulse-indicator/pulse-indicator.component';
import { DirectCallService } from '@core/services/direct-call.service';
import { VoiceRoomService } from '@core/services/voice-room.service';
import { EVoiceSessionType, IUser } from '@konvoez/shared';
import { FileDropDirective } from '@shared/directives/file-drop.directive';

@Component({
  selector: 'app-text-room',
  imports: [
    TextRoomEditorComponent,
    TextRoomListComponent,
    RoomContextMenuComponent,
    TuiTitle,
    TuiHeader,
    TuiButton,
    TuiDropdown,
    TuiHint,
    TuiTextfield,
    TuiInput,
    TuiAutoFocus,
    TuiAvatar,
    TuiInitialsPipe,
    NgOptimizedImage,
    ReactiveFormsModule,
    TranslatePipe,
    FileDropDirective,
    DirectCallPanelComponent,
    PulseIndicatorComponent,
  ],
  templateUrl: './text-room.component.html',
  styleUrl: './text-room.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TextRoomComponent {
  protected readonly textRoomStore = inject(TextRoomStore);
  protected readonly directCallService = inject(DirectCallService);

  private readonly activatedRoute = inject(ActivatedRoute);
  private readonly ngrxStore = inject(Store);
  private readonly usersStore = inject(UsersStore);
  private readonly voiceRoomService = inject(VoiceRoomService);
  private readonly roomManageService = inject(RoomManageService);

  protected readonly canManageRooms = this.roomManageService.canManageRooms;

  protected readonly isDirectChat = computed(() =>
    Boolean(this.routeData()?.['isDirect']),
  );

  protected readonly isCurrentDirectCallActive = computed(() => {
    const isDirectChat = this.isDirectChat();
    const session = this.voiceRoomService.activeSession();
    const directUser = this.user();
    const interlocutor = this.directCallService.interlocutor();
    const isCallActive = this.directCallService.isCallActive();

    if (!isDirectChat) {
      return false;
    }
    if (
      session?.type === EVoiceSessionType.DIRECT_CALL &&
      directUser &&
      session.interlocutorId === directUser.id
    ) {
      return true;
    }

    return (
      isCallActive &&
      interlocutor !== null &&
      directUser !== null &&
      interlocutor.id === directUser.id
    );
  });

  protected readonly canRejoinCall = computed(() => {
    const isDirectChat = this.isDirectChat();
    const isCurrentDirectCallActive = this.isCurrentDirectCallActive();
    const rejoinable = this.directCallService.rejoinableCall();
    const directUser = this.user();

    if (
      !isDirectChat ||
      isCurrentDirectCallActive ||
      !rejoinable ||
      !directUser
    ) {
      return false;
    }
    return (
      rejoinable.callerId === directUser.id ||
      rejoinable.recipientId === directUser.id
    );
  });

  protected readonly room = computed(() => {
    const id = this.targetId();
    const isDirectChat = this.isDirectChat();
    const roomsDict = this.roomsDict();

    if (isDirectChat || !id) {
      return null;
    }
    return roomsDict[id] ?? null;
  });

  protected readonly user = computed(() => {
    const id = this.targetId();
    const isDirectChat = this.isDirectChat();
    const entityMap = this.usersStore.entityMap();

    if (!isDirectChat || !id) {
      return null;
    }
    return entityMap[id] ?? null;
  });

  protected readonly title = computed(() => {
    const isDirectChat = this.isDirectChat();
    const username = this.user()?.username ?? '';
    const roomName = this.room()?.name ?? '';
    return isDirectChat ? username : roomName;
  });

  protected readonly avatarUrl = computed(() => {
    const isDirectChat = this.isDirectChat();
    const userAvatar = this.user()?.avatarUrl ?? null;
    const roomAvatar = this.room()?.avatarUrl ?? null;
    return isDirectChat ? userAvatar : roomAvatar;
  });

  protected readonly searchControl = new FormControl<string>('', {
    nonNullable: true,
  });

  private readonly roomsDict = this.ngrxStore.selectSignal(selectRoomsDict);
  private readonly routeData = toSignal(this.activatedRoute.data);
  private readonly targetId = signal<number | null>(null);
  private readonly editor = viewChild(TextRoomEditorComponent);

  constructor() {
    this.activatedRoute.params
      .pipe(
        finalize(() => {
          this.textRoomStore.leave();
          this.ngrxStore.dispatch(RoomsActions.setSelectedRoomId({ id: null }));
        }),
        takeUntilDestroyed(),
      )
      .subscribe((params) => {
        const id = Number(params['id']);
        this.targetId.set(id);

        if (this.isDirectChat()) {
          this.usersStore.loadAll();
          this.ngrxStore.dispatch(RoomsActions.setSelectedRoomId({ id: null }));
          this.textRoomStore.join({ roomId: null, recipientId: id });
          void this.directCallService.refreshActiveCall(id);
        } else {
          this.ngrxStore.dispatch(RoomsActions.setSelectedRoomId({ id }));
          this.ngrxStore.dispatch(RoomsActions.requestRoom({ id }));
          this.textRoomStore.join({ roomId: id, recipientId: null });
        }

        this.searchControl.setValue('', { emitEvent: false });
      });

    this.searchControl.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe((query) => {
        this.textRoomStore.setSearchQuery(query);
      });
  }

  protected onFilesDropped(files: File[]): void {
    this.editor()?.addFiles(files);
  }

  protected toggleSearch(): void {
    this.onSearchOpenChange(!this.textRoomStore.isSearchOpen());
  }

  protected onSearchOpenChange(open: boolean): void {
    this.textRoomStore.setSearchOpen(open);
    if (!open && this.searchControl.value) {
      this.clearSearch();
    }
  }

  protected clearSearch(): void {
    this.searchControl.setValue('');
    this.textRoomStore.clearSearch();
  }

  protected startDirectCall(recipient: IUser): void {
    void this.directCallService.initiateCall(recipient);
  }

  protected rejoinDirectCall(recipient: IUser): void {
    const call = this.directCallService.rejoinableCall();
    if (!call) {
      return;
    }
    void this.directCallService.rejoinCall(call, recipient);
  }

  protected editRoom(room: IRoom): Promise<void> {
    return this.roomManageService.editRoom(room);
  }

  protected deleteRoom(room: IRoom): void {
    this.roomManageService.deleteRoom(room);
  }
}
