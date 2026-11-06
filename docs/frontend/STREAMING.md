# Frontend streaming

Camera and screen sharing run on top of the voice stack ([Voice](./VOICE.md)).

## Subscribe model

| Kind                      | Published        | Remote video               | Audio                                                                    |
| ------------------------- | ---------------- | -------------------------- | ------------------------------------------------------------------------ |
| Microphone                | While in session | -                          | Automatic, through `PeerPlaybackService`                                 |
| Camera                    | User toggle      | Automatic                  | Video only, through `PeerVideoService`                                   |
| Screen (+ optional audio) | User toggle      | Opt-in (`watchPeerScreen`) | Video through `PeerVideoService`, audio through `PeerScreenAudioService` |

- Each user has at most one camera and one screen stream; a room allows up to 4 video producers. Camera and screen each use AV1, H.264, VP9 or VP8, in that order. The default is H.264. H.264 and AV1 are offered only when the sender and the loaded mediasoup device can send them. The server does not transcode.
- The start dialog sets the max resolution and frame rate, up to two additional layers from presets not above the max, and a bitrate cap. Changing the max selects the next lower preset at the same frame rate. The recommended cap is the sum of the per-layer recommendations, shared across the published layers, and is lower for VP9 and AV1 than for H.264 and VP8. H.264 and VP8 can add layers; VP9 and AV1 publish one. Screen share also sets content mode. Text keeps the resolution and may drop the frame rate. Game balances frame rate and resolution and uses a higher recommended cap. The screen button is hidden when `getDisplayMedia` is unavailable.
- In the desktop app, native screen audio arrives as PCM from the main process and is played into the shared audio track through an AudioWorklet. When the main process falls back to system loopback, the sharer sees a warning that the broadcast includes other participants and may echo. The capture modes are described in the [desktop guide](../../apps/desktop/README.md#screen-share-audio).
- Publish sorts layers low to high, scales each one from the captured height, and drops a layer the capture cannot reach. The streamer's cap, the admin ceiling `STREAM_MAX_BITRATE_KBPS`, and the current quality tier bound the total budget; the tier cap is applied on every layer. When the browser does not apply the requested encodings, the share continues and the client shows one warning.
- A viewer picks Auto or one of the published layers by resolution and frame rate, from the button beside the screen volume on the tile and in theatre. The choice is global. A stream without that layer uses the nearest one not above it. The button is shown only while that stream has more than one layer. Auto follows the largest visible tile and, at the same resolution, the higher frame rate. The client asks the server for that spatial layer and does not otherwise limit incoming bandwidth.
- A video consumer is created paused. It resumes when at least one of its tiles is on screen and the tab is visible. Hiding every tile, or hiding the tab, pauses it after a short delay. Resume applies the layer first, and the server requests a keyframe. Audio consumers stay active.
- Stopping a screen share closes its video producer, and the server closes the paired `screen-audio` producer. Duplicate closes are treated as success, so stopping never hangs.

```mermaid
sequenceDiagram
  participant S as Sharer
  participant Srv as Server
  participant V as Viewer

  S->>Srv: Produce screen (+ screen audio)
  Srv-->>V: Screen available (not consumed)
  alt Viewer can decode
    V->>Srv: watchPeerScreen
    Srv-->>V: Consume screen video and audio
    V->>V: Tile shows the stream
    V->>Srv: Stop watching (or sharer stops)
    Srv-->>V: Consumers closed
  else Viewer cannot decode
    V->>V: Tile shows a placeholder
  end
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

| Service                                        | Responsibility                                                                                |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `MediasoupSessionService`                      | Device, transports, produce and consume.                                                      |
| `PeerVideoService`                             | Remote tracks, available screens (`availableScreens`), watched users (`watchingUserIds`).     |
| `ScreenWatchService`, `ConsumerRegistry`       | Opt-in consumption of screen video. The registry keeps the signalled layer list per consumer. |
| `RemoteVideoViewService`                       | Viewer quality, tile size, visibility, pause and resume of video consumers.                   |
| `LocalScreenPreviewService`                    | Pauses the local screen preview while the tab is hidden or blurred; publishing continues.     |
| `VoiceRoomViewService`                         | Layout (grid or theatre), chrome and focus.                                                   |
| `VoiceRoomTilesService`, `buildVoiceRoomTiles` | Tile view model: voice-only, camera, screen or camera + screen as separate 16:9 tiles.        |
| `VoiceRoomActionsService`                      | Tile actions: watch or stop watching a screen, screen volume.                                 |

## Theatre mode

`VoiceRoomViewService` switches the layout between `grid` and `theatre`. In theatre the grid is unmounted: a strip of mini-tiles sits beside a stage with the focused stream (`theatreFocus: { peerId, stream }`).

- The focus is sticky; if the focused tile disappears, another stream takes over.
- `showGrid()` returns to the grid. The layout resets when the session changes (hangup, leave, logout, room switch).
- Group rooms and direct calls both render through `app-voice-room-shell`, which projects `app-voice-room-overlay` into the grid or theatre component. Controls live in `voice-room-controls-bar`.
