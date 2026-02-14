import { VoiceChatNS } from '@common/voice-chat';
import { createActionGroup, emptyProps, props } from '@ngrx/store';
import { IPeerWithRTC } from './voice-chat.reducer';

export const VoiceChatActions = createActionGroup({
  source: '[VOICE_CHAT]',
  events: {
    signal: props<{ data: VoiceChatNS.ISignal }>(),
    join: props<{ id: number }>(),
    leave: props<{ id: number }>(),
    existingPeersAll: props<{ data: VoiceChatNS.IRoomWithPeers[] }>(),
    existingPeersOnJoin: props<{ data: VoiceChatNS.IRoomWithPeers }>(),
    peerJoined: props<{ data: VoiceChatNS.IPeerJoined }>(),
    peerLeft: props<{ data: VoiceChatNS.IPeerLeft }>(),
    setActivePeers: props<{ peers: IPeerWithRTC[] }>(),
    setAudioInput: props<{ device: MediaDeviceInfo }>(),
    setAudioOutput: props<{ device: MediaDeviceInfo }>(),
  },
});
