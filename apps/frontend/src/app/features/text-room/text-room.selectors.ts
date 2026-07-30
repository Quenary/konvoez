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
export const selectTextRoomMessagesList = createSelector(_select, selectAll);
export const selectTextRoomMessagesDict = createSelector(
  _select,
  selectEntities,
);
export const selectTextRoomNewestId = createSelector(
  selectTextRoomMessagesList,
  (messages) => (messages.length ? messages[messages.length - 1].id : null),
);
export const selectTextRoomOldestId = createSelector(
  selectTextRoomMessagesList,
  (messages) => (messages.length ? messages[0].id : null),
);
export const selectTextRoomEditableMessageId = createSelector(
  _select,
  (state) => state.editableMessageId,
);
export const selectTextRoomEditableMessage = createSelector(
  selectTextRoomMessagesDict,
  selectTextRoomEditableMessageId,
  (messages, id) => (id && messages[id] ? messages[id] : null),
);
