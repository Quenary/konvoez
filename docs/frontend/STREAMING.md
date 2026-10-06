# Frontend streaming (camera & screen)

Camera and screen share on the voice stack in [VOICE.md](./VOICE.md).

## Subscribe model

| Kind                             | Produce                 | Remote subscribe           | Audio                                                                 |
| -------------------------------- | ----------------------- | -------------------------- | --------------------------------------------------------------------- |
| Microphone                       | Always while in session | Auto                       | `PeerPlaybackService`                                                 |
| Camera                           | User toggles            | Auto                       | Video only: `PeerVideoService`                                        |
| Screen (+ optional screen-audio) | User toggles            | Opt-in (`watchPeerScreen`) | Video: `PeerVideoService`. Audio: `PeerScreenAudioService` (own gain) |

One cam and one screen per user. A room allows at most 4 video producers (`cam` + `screen`); the backend rejects another. Senders use VP8.

`VoiceRoomStore` keeps mic gain (`peerGainLevels`) and screen-audio gain (`peerScreenGainLevels`) separate. Capture height and FPS come from local settings and are chosen in the shared start dialog.

The screen button is hidden when `getDisplayMedia` is missing.

## Services

| Service                                  | Role                                                                                                              |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `MediasoupSessionService`                | Device, transports, and produce/consume. Shared transport setup, VP8 pick, and video produce for cam and screen.  |
| `ScreenWatchService`                     | Opt-in screen watch: start, stop, and teardown.                                                                   |
| `ConsumerRegistry`                       | Owns video consumers. Peer video state keeps the track and ids.                                                   |
| `PeerVideoService`                       | Local and remote cam and screen tracks, `availableScreens`, `watchingUserIds`. Cam and screen stay separate.      |
| `PeerScreenAudioService`                 | Sole owner of screen-audio consumers, graphs, and gain. Not mixed into mic playback.                              |
| `CameraService` / `ScreenCaptureService` | `getUserMedia` / `getDisplayMedia`.                                                                               |
| `VoiceSessionService`                    | UI entry for camera and screen produce/stop, plus `watchPeerScreen` / `stopWatchingPeerScreen`.                   |
| `LocalScreenPreviewService`              | Shared pause flag for the local screen preview.                                                                   |
| `VoiceRoomViewService`                   | Theatre focus, chrome auto-hide, fullscreen. Resets when the voice session changes. Does not start or stop media. |

When the selected camera disappears, `CameraService` emits `deviceLost$` and the session stops that producer. Stopping the capture track does not fire the producer `trackended` event.

On leave or producer/consumer close, cam, screen, and screen-audio state is cleared. Stopping a watch or losing a screen producer drops that watch. Auto-consume stays best-effort. An opt-in screen watch rejects when the SFU or the recv transport fails, so the UI can show `CALL.WATCH_SCREEN_FAILED`.

## Tiles

`buildVoiceRoomTiles` (`voice-room-tiles.ts`) builds the grid:

- No cam and no screen: one voice tile.
- Cam or screen only: one tile.
- Both: two tiles, so both can be seen at once.

A remote screen tile exists while that peer is sharing. Its video track is attached only while this client is watching. The local screen tile uses `localScreenTrack`. `LocalScreenPreviewService` pauses that preview 5s after the tab is hidden or the window loses focus (`screenPreviewAutoPauseWhenHidden`). The grid tile, theatre stage, and strip mini-tile share that flag, so it survives the grid unmounting in theatre. Producing to peers continues. Nothing resumes the preview except the Resume button or turning the setting off.

## Theatre

Theatre is a display mode, not a watch action. Any tile can open it, including a voice tile with no stream. `VoiceRoomViewService` stores `{ peerId, stream }` where `stream` is `'cam'`, `'screen'`, or `null`.

The stage shows a `<video>` when the focused tile has a track, otherwise a large `voice-room-tile` with a small inset. The grid is unmounted while theatre is open.

The strip (`voice-room-tile-mini`) sits on the bottom or the right (`preferTheatreStripRight`, container aspect vs stream aspect). Clicking a mini-tile selects it. There is no automatic switch to whoever is speaking.

Stop watching, or the other peer ending the stream, does not close theatre. The service stores the tile the user picked. The stage shows that tile while it exists (without a track the stage is the large tile). If it disappears, the stage shows the first remote tile that has video, otherwise another remote tile, otherwise the remaining tile. That fallback is not written back, so the original tile returns if it shows up again. An empty room stays in theatre with an empty stage. Close is the close button, or Escape when the browser is not fullscreen and a Taiga dialog or dropdown has not already handled that key. Leaving the voice session also closes it: hangup (including the direct-call panel), sidebar leave, the remote side ending the call, logout, and switching rooms. The next session starts in the grid.

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
