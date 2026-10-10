# Konvoez Desktop Client

The Konvoez Desktop client is a lightweight Electron wrapper for the Konvoez PWA. It provides system tray integration, background voice calls, global push-to-mute/deafen hotkeys, native notifications, and automatic updates.

---

## Downloads & Installation

Prebuilt installers are published under GitHub Releases:

- **Rolling Channel (Latest Build)**: [Desktop Latest](https://github.com/Quenary/konvoez/releases/tag/desktop-latest)
- **All Tagged Releases**: [Desktop Releases](https://github.com/Quenary/konvoez/releases?q=desktop-v&expanded=true)

### Windows

1. Download `Konvoez-Setup-x64.exe` (or `Konvoez-Setup-<version>.exe`).
2. Run the installer. It installs per-user in `%LOCALAPPDATA%\Programs\konvoez` without requiring administrative (UAC) elevation.
3. _Note on SmartScreen_: Installers are currently unsigned. When prompted by Windows Defender SmartScreen ("Windows protected your PC"), click **More info** → **Run anyway**.

### Linux

1. Download `Konvoez-x86_64.AppImage` (or `Konvoez-<version>-x86_64.AppImage`).
2. Make the AppImage executable:
   ```bash
   chmod +x Konvoez-x86_64.AppImage
   ```
3. Run the AppImage directly.

---

## Features & Usage

### 1. Server Selection

- On first launch, enter your Konvoez server URL (e.g. `https://konvoez.example.com`).
- The client verifies the server version endpoint (`/api/v1/public/version`) before connecting.
- **Security requirement**: Connections must use `https://`. Unencrypted `http://` is only permitted for local development (`localhost` or `127.0.0.1`).
- You can change the server at any time via the tray menu (**Change server…**) or Settings dialog.

### 2. Background Voice & System Tray

- Closing the application window hides it to the system tray (`--hidden` support), keeping voice calls active in the background.
- Power suspension is automatically prevented while an active voice channel or direct call is open.
- The tray icon tooltip reflects your current voice state (e.g. `(mic muted)` or `(deafened)`).
- The tray context menu provides:
  - **Open Konvoez**: Restore and focus the window.
  - **Mute microphone**: Toggle microphone mute.
  - **Deafen**: Toggle headphones/speaker deafen.
  - **Settings…**: Configure hotkeys and autostart.
  - **Change server…**: Switch connected instance.
  - **Check for updates**: Query for new client versions.
  - **Quit**: Gracefully leaves the active voice call before terminating the process.

### 3. Global Hotkeys

- Configurable global shortcuts in **Settings**:
  - Toggle microphone mute
  - Toggle speaker (deafen)
- Hotkeys work globally even when another application or game is focused.
- **Linux Wayland note**: On Wayland sessions (such as GNOME), global shortcuts require the XDG Desktop Portal `org.freedesktop.portal.GlobalShortcuts`. If the portal is unavailable, hotkey registration falls back gracefully.

### 4. Native Notifications

- Notifications for direct messages and calls are received over the real-time WebSocket connection and displayed as native OS notifications.
- Web Push in the browser application is automatically disabled when running inside the desktop client to prevent duplicate alerts.
- Clicking a notification brings the Konvoez window to the foreground.

### 5. Screen Sharing Picker

- Built-in source picker allows choosing between full screens and application windows.
- Thumbnail previews and application icons are displayed.

---

## Known Limitations

- **Screen share system audio**: Loopback audio capture during screen sharing is supported on Windows only. On Linux (X11 and Wayland), screen sharing captures video only.
- **Wayland global hotkeys**: Requires a compositor that supports the XDG Desktop Portal GlobalShortcuts interface.

---

## Security Model

The desktop client is engineered following strict Electron security best practices:

1. **Context Isolation & Sandboxing**: Renderer windows run with `contextIsolation: true`, `sandbox: true`, and `nodeIntegration: false`.
2. **Minimal Bridge**: Preload scripts expose only a typed, strictly validated IPC bridge (`window.konvoezDesktop`).
3. **Navigation & External Links**: Renderer frames are strictly locked to the configured server origin. All external hyperlinks open in the user's default OS browser.
4. **Scoped Permissions**: Permission requests for microphone, camera, and notifications are restricted to the trusted server origin.

---

## Release & Auto-Updates

The client supports automatic updates via `electron-updater`:

- Automatically checks for updates on startup and periodically in the background.
- Downloads updates in the background and prompts to restart once ready (deferring if an active voice call is in progress).
- Releases are published automatically through GitHub Actions when tags matching `desktop-v*` are generated.
