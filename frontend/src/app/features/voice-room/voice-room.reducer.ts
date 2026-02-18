import { VoiceRoomCommon } from '@common/voice-room';
import { createEntityAdapter, EntityState } from '@ngrx/entity';
import { createReducer, on } from '@ngrx/store';
import { VoiceRoomActions } from './voice-room.actions';

export interface IVoiceRoomState extends EntityState<VoiceRoomCommon.IRoomWithPeers> {
  activeRoomId: number | null;
  activeRoomPeers: VoiceRoomCommon.IPeer[];
  micMuted: boolean;
  soundMuted: boolean;
}

export const voiceRoomAdapter =
  createEntityAdapter<VoiceRoomCommon.IRoomWithPeers>({
    selectId: (room: VoiceRoomCommon.IRoomWithPeers) => room.roomId,
  });

export const voiceRoomInitialState =
  voiceRoomAdapter.getInitialState<IVoiceRoomState>({
    activeRoomId: null,
    activeRoomPeers: [],
    micMuted: false,
    soundMuted: false,
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
  on(VoiceRoomActions.setMicMuted, (state, payload) => ({
    ...state,
    micMuted: payload.micMuted,
    soundMuted: false,
  })),
  on(VoiceRoomActions.setSoundMuted, (state, payload) => ({
    ...state,
    soundMuted: payload.soundMuted,
    micMuted: payload.soundMuted ? true : state.micMuted,
  })),
);
