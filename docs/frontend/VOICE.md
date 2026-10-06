# Frontend voice

Group voice rooms and direct calls share one media stack. Signaling and SFU: [NETWORKING.md](../NETWORKING.md). Camera/screen: [STREAMING.md](./STREAMING.md).

## Layers

Signal stores hold session, lobby presence, and audio prefs. Sockets, mediasoup, and device pipelines live in services (no `Device` / `Transport` / `AudioNode` in stores).

```mermaid
flowchart TB
  UI[Pages and shared voice-room UI]
  VSS[VoiceSessionStore]
  VLS[VoiceLobbyStore]
  VAP[VoiceAudioPreferencesStore]
  Session[VoiceSessionService]
  Ms[MediasoupSessionService]
  DC[DirectCallService]
  Leave[VoiceLeaveService]
  View[VoiceRoomViewService]

  UI --> VSS
  UI --> VLS
  UI --> VAP
  UI --> Session
  UI --> DC
  UI --> Leave
  UI --> View
  DC --> Session
  Session --> VSS
  Session --> VLS
  Session --> Ms
  Leave --> DC
  Leave --> Session
```

- **Hangup:** `VoiceLeaveService.leaveActiveVoice()` — direct call via `DirectCallService.leaveCall()`, else `VoiceSessionService.leaveSession()`. `VoiceSessionService` does not import `DirectCallService`; switching sessions uses `sessionWillChange$` and `detachFromCallWithoutHangup()`.
- **Audio contexts:** capture, playback, and UI SFX are separate; resume after gesture is centralized in `AudioContextResumeService`.

## Flow (short)

1. **Join** — `VoiceSessionService.joinSession` (`GROUP_ROOM` or `DIRECT_CALL`) from room UI, effects, or `DirectCallService`. Join/leave SFX, transports, mic produce, wake lock; reconnect rejoins stored session. Lobby peers: `GET_ALL_PEERS` poll + socket events (`VoiceLobbyStore`; direct calls excluded).
2. **Mic** — `MicrophoneService` pipeline; mute via producer track + `VoiceAudioPreferencesStore`.
3. **Remote audio** — consume → `PeerPlaybackService` (deafen × per-peer gain).
4. **Speaking** — `AudioActivityService`; local registration from `VoiceAudioPreferencesStore` when session + analyser + unmuted mic.
5. **Direct calls** — signaling in `DirectCallService`; UI on `/direct/:id` (`DirectComponent` + `app-voice-room-shell`) and sidebar (`voice-room-panel`, hanging call in rooms aside). Shared grid/overlay: `shared/components/voice-room/`.

## Ownership

| Concern                                  | Owner                                          |
| ---------------------------------------- | ---------------------------------------------- |
| Active session + session peers           | `VoiceSessionStore`                            |
| Who is in which group voice room         | `VoiceLobbyStore`                              |
| Mute, deafen, peer / screen-audio gain   | `VoiceAudioPreferencesStore`                   |
| Join / leave media                       | `VoiceSessionService`                          |
| Call signaling, `callWithUserId`, rejoin | `DirectCallService`                            |
| Hangup button                            | `VoiceLeaveService`                            |
| Device changes in settings               | `AUDIO_DEVICE_HANDLER` → `VoiceSessionService` |
| Theatre, chrome, fullscreen              | `VoiceRoomViewService`                         |
| Grid peer list                           | `VoiceSessionPeersService`                     |

## Code map

- Stores: `apps/frontend/src/app/core/voice/`
- Session / mediasoup / devices: `apps/frontend/src/app/core/services/voice-*.ts`, `mediasoup-session.service.ts`, `peer-*.service.ts`, `direct-call.service.ts`, `voice-leave.service.ts`
- Shared UI: `apps/frontend/src/app/shared/components/voice-room/`
- Routes: `features/voice-room/`, `features/direct/`
