# Frontend streaming

Camera and screen on the voice stack ([VOICE.md](./VOICE.md)).

## Subscribe model

| Kind                             | Produce          | Remote video             | Audio                                                               |
| -------------------------------- | ---------------- | ------------------------ | ------------------------------------------------------------------- |
| Mic                              | While in session | —                        | Auto → `PeerPlaybackService`                                        |
| Camera                           | User toggle      | Auto                     | Video only → `PeerVideoService`                                     |
| Screen (+ optional screen-audio) | User toggle      | Opt-in `watchPeerScreen` | Video → `PeerVideoService`; screen-audio → `PeerScreenAudioService` |

One cam and one screen per user; room cap 4 video producers (backend). VP8 for senders. Mic/speaker mute states, per-peer mic gains and per-peer screen-audio gains live in `VoiceAudioPreferencesStore`. Height/FPS from settings + shared start dialog. Screen button hidden if `getDisplayMedia` is unavailable. Stopping screen share closes the screen video producer; the server also closes the paired `screen-audio` producer. The client still sends close acks for both tracks (with timeout); duplicate closes are treated as success so `stopScreen` cannot hang on an already-closed producer.

## Pipeline

`MediasoupSessionService` — device, transports, produce/consume. `PeerVideoService` — tracks, `availableScreens`, `watchingUserIds`. `ScreenWatchService` + `ConsumerRegistry` for opt-in screen video. `LocalScreenPreviewService` — shared pause for **local** screen preview (tab hidden / window blur; producing continues). `VoiceRoomViewService` — theatre/chrome layout and focus. `VoiceRoomTilesService` — reactive tile view model computation. `VoiceRoomActionsService` — tile and screen watch actions.

Tiles: `buildVoiceRoomTiles` — voice-only, cam, screen, or cam+screen as separate 16:9 tiles. Remote screen video attaches only while watching.

## Theatre & chrome

Theatre is a layout mode (`VoiceRoomViewService`: `layout: 'grid' | 'theatre'`). The active theatre focus is tracked as `theatreFocus: { peerId, stream }`. Grid unmounts while open; strip of mini-tiles; stage video or large tile. Focus is sticky; fallback to another stream if the focused tile disappears. Switch back to grid via `showGrid()`, or reset on session change (hangup, leave, logout, room switch).

`app-voice-room-shell` projects `app-voice-room-overlay` into `app-voice-room-grid` or `app-voice-room-theatre`. Stop-watch and screen volume when watching a remote screen are handled via `VoiceRoomActionsService`. Both group room and direct calls use `app-voice-room-shell`; controls live in `voice-room-controls-bar`.

## Tests (spot checks)

`peer-video.service.spec.ts`, `voice-room-tiles.spec.ts`, `voice-room-tiles.service.spec.ts`, `voice-room-actions.service.spec.ts`, `voice-room-shell.component.spec.ts`, `voice-room-grid.component.spec.ts`, `voice-room-theatre.component.spec.ts`, `voice-room-view.service.spec.ts`, `voice-room-controls-bar.component.spec.ts`, `voice-room.component.spec.ts`, `direct.component.spec.ts`
