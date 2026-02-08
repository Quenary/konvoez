import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core';
import { Store } from '@ngrx/store';
import { RoomsActions } from './rooms.actions';
import { selectRoomsAll } from './rooms.selectors';

@Component({
  selector: 'app-rooms',
  imports: [],
  templateUrl: './rooms.component.html',
  styleUrl: './rooms.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RoomsComponent implements OnInit {
  private readonly store = inject(Store);

  protected readonly rooms = this.store.selectSignal(selectRoomsAll);

  ngOnInit(): void {
    console.log('dispatch');
    this.store.dispatch(RoomsActions.requestRooms());
  }
}
