import { VoiceChatNS } from '@common/voice-chat';
import { createEntityAdapter, EntityState } from '@ngrx/entity';
import { createReducer, on } from '@ngrx/store';
import { VoiceChatActions } from './voice-chat.actions';

export interface IPeerWithRTC extends VoiceChatNS.IPeer {
  /**
   * WebRTC Connection
   */
  rtc: RTCPeerConnection;
}

export interface IVoiceChatState extends EntityState<VoiceChatNS.IRoomWithPeers> {
  activeVoiceChatId: number | null;
  activeVoiceChatPeers: IPeerWithRTC[];
}

export const voiceChatAdapter = createEntityAdapter<VoiceChatNS.IRoomWithPeers>({
  selectId: (room: VoiceChatNS.IRoomWithPeers) => room.roomId,
});

export const voiceChatInitialState = voiceChatAdapter.getInitialState<IVoiceChatState>({
  activeVoiceChatId: null,
  activeVoiceChatPeers: [],
});

export const voiceChatReducer = createReducer<IVoiceChatState>(
  voiceChatInitialState,
  on(VoiceChatActions.join, (state, payload) => ({
    ...state,
    activeVoiceChatId: payload.id,
  })),
  on(VoiceChatActions.leave, (state) => ({
    ...state,
    activeVoiceChatId: null,
  })),
  on(VoiceChatActions.existingPeersAll, (state, payload) =>
    voiceChatAdapter.setAll(payload.data, state),
  ),
  on(VoiceChatActions.setActivePeers, (state, payload) => ({
    ...state,
    activeVoiceChatPeers: payload.peers,
  })),
);
