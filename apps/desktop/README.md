# Konvoez Desktop

Lightweight Electron wrapper around the Konvoez PWA: system tray, background voice, global mute/deafen hotkeys, native notifications, screen-share picker, and auto-updates.

## Downloads

- **Latest**: [desktop-latest](https://github.com/Quenary/konvoez/releases/tag/desktop-latest)
- **All releases**: [desktop-v*](https://github.com/Quenary/konvoez/releases?q=desktop-v&expanded=true)

| Platform | Artifact                  | Notes                                                                                                                                     |
| -------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Windows  | `Konvoez-Setup-x64.exe`   | Per-user install under `%LOCALAPPDATA%\Programs\konvoez` (no UAC). Installers are unsigned — SmartScreen: **More info** → **Run anyway**. |
| Linux    | `Konvoez-x86_64.AppImage` | `chmod +x` then run.                                                                                                                      |

## Development

```bash
npx nx run desktop:serve
npx nx run desktop:package
```

Release tags `desktop-v*` publish installers via GitHub Actions; `electron-updater` checks on startup and in the background (restart prompt deferred during an active voice call).

## Usage

- **Server URL**: Required on first launch; validated via `/api/v1/public/version`. Production URLs must use `https://` (`http://` only for `localhost` / `127.0.0.1`). Change via tray **Change server…** or Settings.
- **Tray**: Closing the window hides to tray (`--hidden`); voice stays active. Tray shows mute/deafen state; menu: open, mute mic, deafen, settings, change server, check updates, quit (leaves voice first). Power suspend is blocked while in a voice channel or direct call.
- **Hotkeys**: Global toggle mic / deafen in Settings. On Linux Wayland, requires XDG Portal `GlobalShortcuts`; otherwise registration is skipped gracefully.
- **Notifications**: DM/call alerts over the app WebSocket as native OS notifications; Web Push is disabled in the desktop shell to avoid duplicates. Click focuses the window and navigates to the corresponding chat.
- **Screen share**: Native picker for displays and windows (thumbnails/icons). System audio loopback: **Windows only** (Linux is video-only).

## Local dialogs (Lit)

Server, Settings, and source-picker UIs are Lit web components in `@konvoez/client-dialogs`, with primitives in `@konvoez/ui-kit` and adapter contracts in `@konvoez/client-shell`. The renderer exposes `window.konvoezLocal` (`IKonvoezLocalBridge`) from preload; entry pages `server.html`, `settings.html`, and `picker.html` mount via `src/pages/mount.ts`. Dialog bundles use a strict CSP and esbuild checks that Node globals do not leak.

Dialog pages load `host.css`, produced at build time by compiling Taiga UI LESS (`libs/ui-kit/src/theme/theme.less`) with system UI fonts. Dark mode follows the OS; components inherit `--tui-*` variables from the document (no per-component token sheets).

See also: [client-shell](../../libs/client-shell/README.md), [ui-kit](../../libs/ui-kit/README.md), [client-dialogs](../../libs/client-dialogs/README.md).

## Security

Renderer: `contextIsolation`, `sandbox`, `nodeIntegration: false`. Preload exposes a typed IPC bridge (`window.konvoezDesktop`). Navigation stays on the configured server origin; external links open in the default browser. Mic, camera, and notification permissions are granted only for that origin.

Chromium is launched with `WebRtcAllowInputVolumeAdjustment` disabled so WebRTC AGC cannot change the OS microphone volume (Windows/macOS). In-app mic level remains a frontend `GainNode` only.
