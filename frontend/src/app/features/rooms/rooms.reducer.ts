import { createEntityAdapter, EntityState } from '@ngrx/entity';
import { IRoom } from './rooms.interface';
import { createReducer, on } from '@ngrx/store';
import { RoomsActions } from './rooms.actions';

export interface IRoomsState extends EntityState<IRoom> {
  selectedRoomId: number | null;
}

export const roomsAdapter = createEntityAdapter<IRoom>({
  selectId: (room: IRoom) => room.id,
  sortComparer: (a, b) => a.name.localeCompare(b.name),
});

export const roomsInitialState = roomsAdapter.getInitialState({
  selectedRoomId: null,
});

export const roomsReducer = createReducer(
  roomsInitialState,
  on(RoomsActions.requestRoomsSuccess, (state, { rooms }) => roomsAdapter.setAll(rooms, state)),
);
