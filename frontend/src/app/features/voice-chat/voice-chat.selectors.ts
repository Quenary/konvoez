import { createSelector } from '@ngrx/store';
import { IAppState } from '../../app.state';
import { voiceChatAdapter } from './voice-chat.reducer';

const _selectVoiceChat = (state: IAppState) => state.voiceChat;
const { selectIds, selectEntities, selectAll, selectTotal } = voiceChatAdapter.getSelectors();

export const selectVoiceChatList = createSelector(_selectVoiceChat, selectAll);
export const selectVoiceChatDict = createSelector(_selectVoiceChat, selectEntities);
export const selectActiveVoiceChatId = createSelector(
  _selectVoiceChat,
  (state) => state.activeVoiceChatId,
);
export const selectActiveVoiceChat = createSelector(
  selectVoiceChatDict,
  selectActiveVoiceChatId,
  (rooms, activeVoiceChatId) => (activeVoiceChatId ? rooms[activeVoiceChatId] : null),
);
export const selectActiveVoiceChatPeers = createSelector(
  _selectVoiceChat,
  (state) => state.activeVoiceChatPeers,
);
