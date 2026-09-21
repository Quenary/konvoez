import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { finalize } from 'rxjs';
import { Store } from '@ngrx/store';
import { RoomsActions } from '../rooms/rooms.actions';
import { selectRoomsDict } from '../rooms/rooms.selectors';
import { UsersStore } from '../users/users.store';
import { TextRoomEditorComponent } from './text-room-editor/text-room-editor.component';
import { TextRoomListComponent } from './text-room-list/text-room-list.component';
import { TextRoomStore } from './text-room.store';
import { TuiButton, TuiInput, TuiTextfield, TuiTitle } from '@taiga-ui/core';
import { TuiHeader } from '@taiga-ui/layout';
import { TuiAutoFocus } from '@taiga-ui/cdk';
import { TuiAvatar, TuiInitialsPipe } from '@taiga-ui/kit';
import { NgOptimizedImage } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { TranslatePipe } from '@ngx-translate/core';

@Component({
  selector: 'app-text-room',
  imports: [
    TextRoomEditorComponent,
    TextRoomListComponent,
    TuiTitle,
    TuiHeader,
    TuiButton,
    TuiTextfield,
    TuiInput,
    TuiAutoFocus,
    TuiAvatar,
    TuiInitialsPipe,
    NgOptimizedImage,
    ReactiveFormsModule,
    TranslatePipe,
  ],
  templateUrl: './text-room.component.html',
  styleUrl: './text-room.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TextRoomComponent {
  private readonly activatedRoute = inject(ActivatedRoute);
  private readonly ngrxStore = inject(Store);
  private readonly usersStore = inject(UsersStore);
  protected readonly textRoomStore = inject(TextRoomStore);

  protected readonly isDirectChat = computed(() =>
    Boolean(this.routeData()?.['isDirect']),
  );

  protected readonly targetId = signal<number | null>(null);

  protected readonly room = computed(() => {
    const id = this.targetId();
    if (this.isDirectChat() || !id) {
      return null;
    }
    const roomsDict = this.roomsDict();
    return roomsDict[id] ?? null;
  });

  protected readonly user = computed(() => {
    const id = this.targetId();
    if (!this.isDirectChat() || !id) {
      return null;
    }
    return this.usersStore.entityMap()[id] ?? null;
  });

  protected readonly title = computed(() => {
    if (this.isDirectChat()) {
      return this.user()?.username ?? '';
    }
    return this.room()?.name ?? '';
  });

  protected readonly avatarUrl = computed(() => {
    if (this.isDirectChat()) {
      return this.user()?.avatarUrl ?? null;
    }
    return this.room()?.avatarUrl ?? null;
  });

  protected readonly searchControl = new FormControl<string>('', {
    nonNullable: true,
  });

  private readonly roomsDict = this.ngrxStore.selectSignal(selectRoomsDict);

  private readonly routeData = toSignal(this.activatedRoute.data);

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
}
