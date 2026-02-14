import { VoiceRoomCommon } from '@common/voice-room';
import { createActionGroup, props } from '@ngrx/store';
import { IPeerWithRTC } from './voice-room.reducer';

export const VoiceRoomActions = createActionGroup({
  source: '[VOICE_ROOM]',
  events: {
    signal: props<{ data: VoiceRoomCommon.ISignal }>(),
    join: props<{ id: number }>(),
    leave: props<{ id: number }>(),
    existingPeersAll: props<{ data: VoiceRoomCommon.IRoomWithPeers[] }>(),
    existingPeersOnJoin: props<{ data: VoiceRoomCommon.IRoomWithPeers }>(),
    peerJoined: props<{ data: VoiceRoomCommon.IPeerJoined }>(),
    peerLeft: props<{ data: VoiceRoomCommon.IPeerLeft }>(),
    setActivePeers: props<{ peers: IPeerWithRTC[] }>(),
    setAudioInput: props<{ device: MediaDeviceInfo }>(),
    setAudioOutput: props<{ device: MediaDeviceInfo }>(),
  },
});
