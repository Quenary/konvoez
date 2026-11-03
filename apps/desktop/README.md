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

`nx build desktop` does not require Rust. `desktop:package` includes `konvoez-native.*.node` when `npx nx run desktop-native:build` has already produced it.

Release tags `desktop-v*` publish installers via GitHub Actions; `electron-updater` checks on startup and in the background (restart prompt deferred during an active voice call).

## Usage

- **Server URL**: Required on first launch; validated via `/api/v1/public/version`. Production URLs must use `https://` (`http://` only for `localhost` / `127.0.0.1`). Change via tray **Change server…** or Settings.
- **Tray**: Closing the window hides to tray (`--hidden`); voice stays active. Tray shows mute/deafen state; menu: open, mute mic, deafen, settings, change server, check updates, quit (leaves voice first). Power suspend is blocked while in a voice channel or direct call.
- **Hotkeys**: Global toggle mic / deafen in Settings. Uses a non-blocking low-level hook on Windows (`WH_KEYBOARD_LL`) and Linux X11 (`XRecord`), ensuring keys are never blocked or swallowed. On Wayland, when the native module is missing, or when the hook cannot be installed, falls back to `globalShortcut`.
- **Notifications**: DM/call alerts over the app WebSocket as native OS notifications; Web Push is disabled in the desktop shell to avoid duplicates. Click focuses the window and navigates to the corresponding chat.
- **Screen share**: Native picker for displays and windows (thumbnails/icons). A window of another app is captured with native include, then native exclude of Konvoez, then Windows system loopback. A screen or the Konvoez window skips include. The renderer receives the mode that actually started (`include`, `exclude`, `loopback`, or `none`). Loopback is the last resort on Windows; Linux stays video-only when native capture cannot start.

## Local dialogs (Lit)

Server, Settings, and source-picker UIs are Lit web components in `@konvoez/client-dialogs`, with primitives in `@konvoez/ui-kit` and adapter contracts in `@konvoez/client-shell`. The renderer exposes `window.konvoezLocal` (`IKonvoezLocalBridge`) from preload; entry pages `server.html`, `settings.html`, and `picker.html` mount via `src/pages/mount.ts`. Dialog bundles use a strict CSP and esbuild checks that Node globals do not leak.

Dialog pages load `host.css`, produced at build time by compiling Taiga UI LESS (`libs/ui-kit/src/theme/theme.less`) with system UI fonts. Dark mode follows the OS; components inherit `--tui-*` variables from the document (no per-component token sheets).

See also: [client-shell](../../libs/client-shell/README.md), [ui-kit](../../libs/ui-kit/README.md), [client-dialogs](../../libs/client-dialogs/README.md).

## Native module (Rust)

`libs/desktop-native` is a Rust NAPI addon providing process-isolated loopback audio capture and passive global keyboard hooks. Build prerequisites and workspace setup are in [CONTRIBUTING.md](../../docs/CONTRIBUTING.md#1-prerequisites).

- **Build**: `npx nx run desktop-native:build`
- **Tests**: `npx nx run desktop-native:test`
- **Lint**: `npx nx run desktop-native:lint`

If the native binary is missing or unsupported on the current host, the desktop app gracefully falls back to `globalShortcut` and standard audio capture.

## Security

Renderer: `contextIsolation`, `sandbox`, `nodeIntegration: false`. Preload exposes a typed IPC bridge (`window.konvoezDesktop`). Navigation stays on the configured server origin; external links open in the default browser. Mic, camera, and notification permissions are granted only for that origin.

Chromium is launched with `WebRtcAllowInputVolumeAdjustment` disabled so WebRTC AGC cannot change the OS microphone volume (Windows/macOS). In-app mic level remains a frontend `GainNode` only.
