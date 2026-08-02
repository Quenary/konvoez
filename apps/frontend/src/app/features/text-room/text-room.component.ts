import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { finalize } from 'rxjs';
import { TextRoomEditorComponent } from './text-room-editor/text-room-editor.component';
import { TextRoomListComponent } from './text-room-list/text-room-list.component';
import { TextRoomStore } from './text-room.store';

@Component({
  selector: 'app-text-room',
  imports: [TextRoomEditorComponent, TextRoomListComponent],
  templateUrl: './text-room.component.html',
  styleUrl: './text-room.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TextRoomComponent {
  private readonly textRoomStore = inject(TextRoomStore);
  private readonly activatedRoute = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    this.activatedRoute.params
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.textRoomStore.leave()),
      )
      .subscribe((params) => {
        const roomId = Number(params['id']);
        this.textRoomStore.join({ roomId, recipientId: null });
      });
  }
}
