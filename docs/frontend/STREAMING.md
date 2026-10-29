# Frontend streaming

Camera and screen sharing run on top of the voice stack ([Voice](./VOICE.md)).

## Subscribe model

| Kind                      | Published        | Remote video               | Audio                                                                    |
| ------------------------- | ---------------- | -------------------------- | ------------------------------------------------------------------------ |
| Microphone                | While in session | -                          | Automatic, through `PeerPlaybackService`                                 |
| Camera                    | User toggle      | Automatic                  | Video only, through `PeerVideoService`                                   |
| Screen (+ optional audio) | User toggle      | Opt-in (`watchPeerScreen`) | Video through `PeerVideoService`, audio through `PeerScreenAudioService` |

- Each user has at most one camera and one screen stream; a room allows up to 4 video producers. Video uses VP8.
- The start dialog sets resolution, frame rate, layer count and a bitrate cap. Screen share also sets content mode: Text keeps detail, Game keeps motion. The screen button is hidden when `getDisplayMedia` is unavailable.
- Publish uses one encoding per spatial layer (1–3). The streamer's cap, the admin ceiling `STREAM_MAX_BITRATE_KBPS`, and the current quality tier bound the total budget; the tier cap is applied on every layer. When the browser does not apply the requested encodings, the share continues and the client shows one warning.
- A viewer chooses Auto, Low, Medium, High or Source from the button beside the screen volume, on the tile and in theatre, while a watched stream has more than one layer. Auto follows the largest visible tile. The client asks the server for that spatial layer and does not otherwise limit incoming bandwidth.
- A video consumer is created paused. It resumes when at least one of its tiles is on screen and the tab is visible. Hiding every tile, or hiding the tab, pauses it after a short delay. Resume applies the layer first, and the server requests a keyframe. Audio consumers stay active.
- Stopping a screen share closes its video producer, and the server closes the paired `screen-audio` producer. Duplicate closes are treated as success, so stopping never hangs.

```mermaid
sequenceDiagram
  participant S as Sharer
  participant Srv as Server
  participant V as Viewer

  S->>Srv: Produce screen (+ screen audio)
  Srv-->>V: Screen available (not consumed)
  V->>Srv: watchPeerScreen
  Srv-->>V: Consume screen video and audio
  V->>V: Tile shows the stream
  V->>Srv: Stop watching (or sharer stops)
  Srv-->>V: Consumers closed
```

```mermaid
sequenceDiagram
  participant V as Viewer
  participant Srv as Server

  V->>Srv: Consume video, created paused
  V->>Srv: Set preferred layer
  V->>Srv: Resume when a tile is visible
  Note over Srv: Keyframe for video
  V->>Srv: Pause after the tile stays hidden
```

## Services

| Service                                        | Responsibility                                                                                                                |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `MediasoupSessionService`                      | Device, transports, produce and consume.                                                                                      |
| `PeerVideoService`                             | Remote tracks, available screens (`availableScreens`), watched users (`watchingUserIds`).                                     |
| `ScreenWatchService`, `ConsumerRegistry`       | Opt-in consumption of screen video. The registry tracks source height and whether any watched stream has more than one layer. |
| `RemoteVideoViewService`                       | Viewer quality, tile size, visibility, pause and resume of video consumers.                                                   |
| `LocalScreenPreviewService`                    | Pauses the local screen preview while the tab is hidden or blurred; publishing continues.                                     |
| `VoiceRoomViewService`                         | Layout (grid or theatre), chrome and focus.                                                                                   |
| `VoiceRoomTilesService`, `buildVoiceRoomTiles` | Tile view model: voice-only, camera, screen or camera + screen as separate 16:9 tiles.                                        |
| `VoiceRoomActionsService`                      | Tile actions: watch or stop watching a screen, screen volume.                                                                 |

## Theatre mode

`VoiceRoomViewService` switches the layout between `grid` and `theatre`. In theatre the grid is unmounted: a strip of mini-tiles sits beside a stage with the focused stream (`theatreFocus: { peerId, stream }`).

- The focus is sticky; if the focused tile disappears, another stream takes over.
- `showGrid()` returns to the grid. The layout resets when the session changes (hangup, leave, logout, room switch).
- Group rooms and direct calls both render through `app-voice-room-shell`, which projects `app-voice-room-overlay` into the grid or theatre component. Controls live in `voice-room-controls-bar`.
