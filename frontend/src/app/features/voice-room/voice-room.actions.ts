import { VoiceRoomCommon } from '@common/voice-room';
import { createActionGroup, emptyProps, props } from '@ngrx/store';

export const VoiceRoomActions = createActionGroup({
  source: 'VOICE_ROOM',
  events: {
    join: props<{ id: number }>(),
    leave: emptyProps(),
    existingPeersAll: props<{ data: VoiceRoomCommon.IRoomWithUsers[] }>(),
    setMicMuted: props<{ micMuted: boolean }>(),
    setSoundMuted: props<{ soundMuted: boolean }>(),
  },
});
