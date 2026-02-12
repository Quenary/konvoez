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

export const roomsInitialState = roomsAdapter.getInitialState<IRoomsState>({
  selectedRoomId: null,
});

export const roomsReducer = createReducer<IRoomsState>(
  roomsInitialState,
  on(RoomsActions.selectRoom, (state, payload) => ({
    ...state,
    selectedRoomId: payload.room?.id ?? null,
  })),
  on(RoomsActions.requestRoomSuccess, (state, payload) =>
    roomsAdapter.upsertOne(payload.room, state),
  ),
  on(RoomsActions.requestRoomsSuccess, (state, { rooms }) => roomsAdapter.setAll(rooms, state)),
  on(RoomsActions.requestCreateRoomSuccess, (state, payload) =>
    roomsAdapter.addOne(payload.room, state),
  ),
  on(RoomsActions.requestUpdateRoomSuccess, (state, payload) =>
    roomsAdapter.updateOne({ changes: payload.room, id: payload.room.id }, state),
  ),
  on(RoomsActions.requestDeleteRoomSuccess, (state, payload) =>
    roomsAdapter.removeOne(payload.id, state),
  ),
);
