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
export const selectTextRoomMessages = createSelector(_select, selectAll);
export const selectTextRoomNewestId = createSelector(
  selectTextRoomMessages,
  (messages) => (messages.length ? messages[messages.length - 1].id : null),
);
export const selectTextRoomOldestId = createSelector(
  selectTextRoomMessages,
  (messages) => (messages.length ? messages[0].id : null),
);
export const selectTextRoomAvatars = createSelector(
  _select,
  (state) => state.avatars,
);
