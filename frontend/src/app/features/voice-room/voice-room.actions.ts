import { VoiceRoomCommon } from '@common/voice-room';
import { createActionGroup, emptyProps, props } from '@ngrx/store';

export const VoiceRoomActions = createActionGroup({
  source: 'VOICE_ROOM',
  events: {
    join: props<{ id: number }>(),
    leave: emptyProps(),
    existingPeersAll: props<{ data: VoiceRoomCommon.IRoomWithPeers[] }>(),
    existingPeersOnJoin: props<{ data: VoiceRoomCommon.IRoomWithPeers }>(),
    peerJoined: props<{ data: VoiceRoomCommon.IPeerJoined }>(),
    peerLeft: props<{ data: VoiceRoomCommon.IPeerLeft }>(),
    setActivePeers: props<{ peers: VoiceRoomCommon.IPeer[] }>(),
    setMicMuted: props<{ micMuted: boolean }>(),
    setSoundMuted: props<{ soundMuted: boolean }>(),
  },
});
