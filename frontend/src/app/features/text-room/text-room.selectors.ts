import { createSelector } from '@ngrx/store';
import { textRoomAdapter } from './text-room.reducer';
import { IAppState } from '../../app.state';

const { selectAll, selectEntities, selectIds, selectTotal } =
  textRoomAdapter.getSelectors();

const _select = (state: IAppState) => state.textRoom;

export const selectTextRoomState = createSelector(_select, (state) => state);
export const selectTextRoomSelectedId = createSelector(
  _select,
  (state) => state.selectedRoomId,
);
export const selectTextRoomSelectedRecipientId = createSelector(
  _select,
  (state) => state.selectedRecipientId,
);
export const selectMessagesList = createSelector(_select, selectAll);
// export const selectTextRoomCenterPage = createSelector(
//   _select,
//   (state) => state.centerPage,
// );
export const selectTextRoomCurrentPage = createSelector(
  _select,
  (state) => state.currentPage,
);
export const selectTextRoomTotalPages = createSelector(
  _select,
  (state) => state.totalPages,
);
export const selectTextRoomLoadedPages = createSelector(
  _select,
  (state) => state.loadedPages,
);
