import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TextRoomEditorComponent } from './text-room-editor/text-room-editor.component';
import { TextRoomListComponent } from './text-room-list/text-room-list.component';
import { ActivatedRoute } from '@angular/router';
import { Store } from '@ngrx/store';
import { TextRoomActions } from './text-room.actions';

@Component({
  selector: 'app-text-room',
  imports: [TextRoomEditorComponent, TextRoomListComponent],
  templateUrl: './text-room.component.html',
  styleUrl: './text-room.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TextRoomComponent {
  private readonly store = inject(Store);
  private readonly activatedRoute = inject(ActivatedRoute);

  constructor() {
    this.activatedRoute.params.subscribe((params) => {
      const roomId = Number(params['id']);
      this.store.dispatch(TextRoomActions.join({ roomId, recipientId: null }));
    });
  }
}
