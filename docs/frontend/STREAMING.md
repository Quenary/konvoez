# Frontend streaming (camera & screen)

Camera and screen share on the voice stack in [VOICE.md](./VOICE.md).

## Subscribe model

| Kind                             | Produce                 | Remote subscribe           | Audio                                                                 |
| -------------------------------- | ----------------------- | -------------------------- | --------------------------------------------------------------------- |
| Microphone                       | Always while in session | Auto                       | `PeerPlaybackService`                                                 |
| Camera                           | User toggles            | Auto                       | Video only: `PeerVideoService`                                        |
| Screen (+ optional screen-audio) | User toggles            | Opt-in (`watchPeerScreen`) | Video: `PeerVideoService`. Audio: `PeerScreenAudioService` (own gain) |

One cam and one screen per user. A room allows at most 4 video producers (`cam` + `screen`); the backend rejects another. Senders use VP8.

`VoiceRoomStore` keeps mic gain (`peerGainLevels`) and screen-audio gain (`peerScreenGainLevels`) separate. Capture height and FPS come from local settings and are chosen in the start dialogs.

The screen button is hidden when `getDisplayMedia` is missing.

## Services

| Service                                  | Role                                                                                                              |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `MediasoupSessionService`                | Produce and consume cam, screen, and screen-audio. Registers available screen producers and tears consumers down. |
| `PeerVideoService`                       | Local and remote cam and screen tracks, `availableScreens`, `watchingUserIds`. Cam and screen stay separate.      |
| `PeerScreenAudioService`                 | Screen-audio graphs and gain. Not mixed into mic playback.                                                        |
| `CameraService` / `ScreenCaptureService` | `getUserMedia` / `getDisplayMedia`.                                                                               |
| `VoiceSessionService`                    | `watchPeerScreen` / `stopWatchingPeerScreen`.                                                                     |
| `VoiceRoomViewService`                   | Theatre focus, chrome auto-hide, fullscreen. Does not start or stop media.                                        |

On leave or producer/consumer close, cam, screen, and screen-audio state is cleared. Stopping a watch or losing a screen producer drops that watch.

## Tiles

`buildVoiceRoomTiles` (`voice-room-tiles.ts`) builds the grid:

- No cam and no screen: one voice tile.
- Cam or screen only: one tile.
- Both: two tiles, so both can be seen at once.

A remote screen tile exists while that peer is sharing. Its video track is attached only while this client is watching. The local screen tile uses `localScreenTrack`. Its preview pauses 5s after the tab is hidden or the window loses focus (`screenPreviewAutoPauseWhenHidden`); producing to peers continues. The user resumes the preview manually.

## Theatre

Theatre is a display mode, not a watch action. Any tile can open it, including a voice tile with no stream. `VoiceRoomViewService` stores `{ peerId, stream }` where `stream` is `'cam'`, `'screen'`, or `null`.

The stage shows a `<video>` when the focused tile has a track, otherwise a large `voice-room-tile` with a small inset. The grid is unmounted while theatre is open.

The strip (`voice-room-tile-mini`) sits on the bottom or the right (`preferTheatreStripRight`, container aspect vs stream aspect). Clicking a mini-tile selects it. There is no automatic switch to whoever is speaking.

Stop watching, or the other peer ending the stream, does not close theatre. If that tile still exists, focus stays on it (without a track the stage is the large tile). If that stream tile is gone, focus moves to the same peer's remaining tile, otherwise the first tile in the list. An empty room stays in theatre with an empty stage. Close is the close button or Escape when not fullscreen. Leaving the voice session also closes it: hangup (including the direct-call panel), sidebar leave, the remote side ending the call, logout, and switching rooms. The next session starts in the grid.

## Chrome

The room page projects `app-voice-room-overlay` into `app-voice-room-grid` with `<ng-template appVoiceOverlay>`. The grid draws it over the whole grid. Theatre draws it over the stage cell only, so the mini-tile strip stays clickable.

Stop-watch and screen volume show only while a remote screen is actually being watched. The compact direct-call grid does not use this overlay; it keeps its own footer.

Shared UI: `apps/frontend/src/app/shared/components/voice-room/`. Preview `<video>` elements use `playsinline`.

## Tests

- `peer-video.service.spec.ts` — separate cam and screen tracks, watch set, available screens
- `voice-room-tiles.spec.ts` — one or two tiles, theatre focus fallback
- `voice-peers-layout.spec.ts` — section class and strip side
- `voice-room-tile.component.spec.ts` — local screen preview pause
- `voice-room-grid.component.spec.ts` — grid vs theatre, focus stays or retargets
- `voice-room-theatre.component.spec.ts` — strip selection, large tile without video
- `voice-room-view.service.spec.ts` — open, retarget, Escape, fullscreen
