import { createSelector } from '@ngrx/store';
import { IAppState } from '@app/app.state';
import { roomsAdapter } from './rooms.reducer';
import { ERoomType } from '@common/enums';

const _selectRooms = (state: IAppState) => state.rooms;

const { selectIds, selectEntities, selectAll, selectTotal } =
  roomsAdapter.getSelectors();

export const selectRoomsList = createSelector(_selectRooms, selectAll);
export const selectTextRoomsList = createSelector(selectRoomsList, (list) =>
  list.filter((item) => item.type == ERoomType.TEXT),
);
export const selectVoiceRoomsList = createSelector(selectRoomsList, (list) =>
  list.filter((item) => item.type == ERoomType.VOICE),
);
export const selectRoomsDict = createSelector(_selectRooms, selectEntities);
export const selectSelectedRoomId = createSelector(
  _selectRooms,
  (state) => state.selectedRoomId,
);
export const selectSelectedRoom = createSelector(
  selectRoomsDict,
  selectSelectedRoomId,
  (rooms, selectedRoomId) => (selectedRoomId ? rooms[selectedRoomId] : null),
);
