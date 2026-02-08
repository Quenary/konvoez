import { createSelector } from '@ngrx/store';
import { IAppState } from '../../app.state';
import { roomsAdapter } from './rooms.reducer';

const _selectRooms = (state: IAppState) => state.rooms;

const { selectIds, selectEntities, selectAll, selectTotal } = roomsAdapter.getSelectors();

export const selectRoomsAll = createSelector(_selectRooms, selectAll);
