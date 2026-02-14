import { VoiceRoomCommon } from '@common/voice-room';
import { createEntityAdapter, EntityState } from '@ngrx/entity';
import { createReducer, on } from '@ngrx/store';
import { VoiceRoomActions } from './voice-room.actions';

export interface IPeerWithRTC extends VoiceRoomCommon.IPeer {
  /**
   * WebRTC Connection
   */
  rtc: RTCPeerConnection;
}

export interface IVoiceRoomState extends EntityState<VoiceRoomCommon.IRoomWithPeers> {
  activeRoomId: number | null;
  activeRoomPeers: IPeerWithRTC[];
}

export const voiceRoomAdapter = createEntityAdapter<VoiceRoomCommon.IRoomWithPeers>({
  selectId: (room: VoiceRoomCommon.IRoomWithPeers) => room.roomId,
});

export const voiceRoomInitialState = voiceRoomAdapter.getInitialState<IVoiceRoomState>({
  activeRoomId: null,
  activeRoomPeers: [],
});

export const voiceRoomReducer = createReducer<IVoiceRoomState>(
  voiceRoomInitialState,
  on(VoiceRoomActions.join, (state, payload) => ({
    ...state,
    activeRoomId: payload.id,
  })),
  on(VoiceRoomActions.leave, (state) => ({
    ...state,
    activeRoomId: null,
  })),
  on(VoiceRoomActions.existingPeersAll, (state, payload) =>
    voiceRoomAdapter.setAll(payload.data, state),
  ),
  on(VoiceRoomActions.setActivePeers, (state, payload) => ({
    ...state,
    activeRoomPeers: payload.peers,
  })),
);
