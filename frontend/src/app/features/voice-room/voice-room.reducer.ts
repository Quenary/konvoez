import { VoiceRoomCommon } from '@common/voice-room';
import { createEntityAdapter, EntityState } from '@ngrx/entity';
import { createReducer, on } from '@ngrx/store';
import { VoiceRoomActions } from './voice-room.actions';

export interface IVoiceRoomState extends EntityState<VoiceRoomCommon.IRoomWithUsers> {
  activeRoomId: number | null;
  micMuted: boolean;
  soundMuted: boolean;
}

export const voiceRoomAdapter =
  createEntityAdapter<VoiceRoomCommon.IRoomWithUsers>({
    selectId: (room: VoiceRoomCommon.IRoomWithUsers) => room.roomId,
  });

export const voiceRoomInitialState =
  voiceRoomAdapter.getInitialState<IVoiceRoomState>({
    activeRoomId: null,
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
);
