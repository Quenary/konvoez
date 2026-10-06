# Frontend streaming

Camera and screen on the voice stack ([VOICE.md](./VOICE.md)).

## Subscribe model

| Kind                             | Produce          | Remote video             | Audio                                                               |
| -------------------------------- | ---------------- | ------------------------ | ------------------------------------------------------------------- |
| Mic                              | While in session | —                        | Auto → `PeerPlaybackService`                                        |
| Camera                           | User toggle      | Auto                     | Video only → `PeerVideoService`                                     |
| Screen (+ optional screen-audio) | User toggle      | Opt-in `watchPeerScreen` | Video → `PeerVideoService`; screen-audio → `PeerScreenAudioService` |

One cam and one screen per user; room cap 4 video producers (backend). VP8 for senders. Mic gain and screen-audio gain live in `VoiceAudioPreferencesStore`. Height/FPS from settings + shared start dialog. Screen button hidden if `getDisplayMedia` is unavailable.

## Pipeline

`MediasoupSessionService` — device, transports, produce/consume. `PeerVideoService` — tracks, `availableScreens`, `watchingUserIds`. `ScreenWatchService` + `ConsumerRegistry` for opt-in screen video. `LocalScreenPreviewService` — shared pause for **local** screen preview (tab hidden / window blur; producing continues). `VoiceRoomViewService` — theatre/chrome only.

Tiles: `buildVoiceRoomTiles` — voice-only, cam, screen, or cam+screen as separate 16:9 tiles. Remote screen video attaches only while watching.

## Theatre & chrome

Theatre is a layout mode (`VoiceRoomViewService`: `{ peerId, stream }`). Grid unmounts while open; strip of mini-tiles; stage video or large tile. Focus is sticky; fallback to another stream if the focused tile disappears. Close: overlay actions, Escape (if allowed), or session end (hangup, leave, logout, room switch).

`app-voice-room-overlay` is projected into `app-voice-room-grid` (grid and theatre stage). Stop-watch and screen volume when watching a remote screen. Group room page and `app-voice-room-shell` (group + direct call) use the same overlay; controls in `voice-room-controls-bar`.

## Tests (spot checks)

`peer-video.service.spec.ts`, `voice-room-tiles.spec.ts`, `voice-room-grid.component.spec.ts`, `voice-room-theatre.component.spec.ts`, `voice-room-view.service.spec.ts`, `voice-room-controls-bar.component.spec.ts`, `voice-room.component.spec.ts`, `direct.component.spec.ts`
