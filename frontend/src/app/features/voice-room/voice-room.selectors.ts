import { createSelector } from '@ngrx/store';
import { IAppState } from '../../app.state';
import { voiceRoomAdapter } from './voice-room.reducer';

const _selectVoiceRoom = (state: IAppState) => state.voiceRoom;
const { selectIds, selectEntities, selectAll, selectTotal } = voiceRoomAdapter.getSelectors();

export const selectVoiceRoomList = createSelector(_selectVoiceRoom, selectAll);
export const selectVoiceRoomDict = createSelector(_selectVoiceRoom, selectEntities);
export const selectActiveVoiceRoomId = createSelector(
  _selectVoiceRoom,
  (state) => state.activeRoomId,
);
export const selectActiveVoiceRoom = createSelector(
  selectVoiceRoomDict,
  selectActiveVoiceRoomId,
  (rooms, activeRoomId) => (activeRoomId ? rooms[activeRoomId] : null),
);
export const selectActiveVoiceRoomPeers = createSelector(
  _selectVoiceRoom,
  (state) => state.activeRoomPeers,
);
