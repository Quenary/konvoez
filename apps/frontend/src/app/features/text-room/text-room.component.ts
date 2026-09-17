import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { finalize } from 'rxjs';
import { Store } from '@ngrx/store';
import { RoomsActions } from '../rooms/rooms.actions';
import { selectRoomsDict } from '../rooms/rooms.selectors';
import { TextRoomEditorComponent } from './text-room-editor/text-room-editor.component';
import { TextRoomListComponent } from './text-room-list/text-room-list.component';
import { TextRoomStore } from './text-room.store';
import {
  TuiButton,
  TuiIcon,
  TuiInput,
  TuiTextfield,
  TuiTitle,
} from '@taiga-ui/core';
import { TuiHeader } from '@taiga-ui/layout';
import { TuiAutoFocus } from '@taiga-ui/cdk';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { TranslatePipe } from '@ngx-translate/core';

@Component({
  selector: 'app-text-room',
  imports: [
    TextRoomEditorComponent,
    TextRoomListComponent,
    TuiIcon,
    TuiTitle,
    TuiHeader,
    TuiButton,
    TuiTextfield,
    TuiInput,
    TuiAutoFocus,
    ReactiveFormsModule,
    TranslatePipe,
  ],
  templateUrl: './text-room.component.html',
  styleUrl: './text-room.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TextRoomComponent {
  private readonly activatedRoute = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly ngrxStore = inject(Store);
  protected readonly textRoomStore = inject(TextRoomStore);

  protected readonly roomId = signal<number | null>(null);
  protected readonly room = computed(() => {
    const id = this.roomId();
    const roomsDict = this.roomsDict();
    return id ? (roomsDict[id] ?? null) : null;
  });
  protected readonly searchControl = new FormControl<string>('', {
    nonNullable: true,
  });

  private readonly roomsDict = this.ngrxStore.selectSignal(selectRoomsDict);

  constructor() {
    this.activatedRoute.params
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.textRoomStore.leave();
          this.ngrxStore.dispatch(RoomsActions.setSelectedRoomId({ id: null }));
        }),
      )
      .subscribe((params) => {
        const roomId = Number(params['id']);
        this.roomId.set(roomId);
        this.ngrxStore.dispatch(RoomsActions.setSelectedRoomId({ id: roomId }));
        this.ngrxStore.dispatch(RoomsActions.requestRoom({ id: roomId }));
        this.textRoomStore.join({ roomId, recipientId: null });
        this.searchControl.setValue('', { emitEvent: false });
      });

    this.searchControl.valueChanges
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        takeUntilDestroyed(this.destroyRef),
      )
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
