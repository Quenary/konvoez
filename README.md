# Konvoez

Konvoez is a self-hosted, single-server voice and text communication platform (Discord-like alternative where the deployed application instance acts as the server itself). Designed for friends to hang out, not for production use.

## Desktop App

[![Download for Windows](https://img.shields.io/badge/Download-Windows-0078D6?logo=windows)](https://github.com/Quenary/konvoez/releases/download/desktop-latest/Konvoez-Setup-x64.exe)
[![Download for Linux](https://img.shields.io/badge/Download-Linux%20AppImage-FCC624?logo=linux&logoColor=black)](https://github.com/Quenary/konvoez/releases/download/desktop-latest/Konvoez-x86_64.AppImage)

All versions: [desktop releases](https://github.com/Quenary/konvoez/releases?q=desktop-v&expanded=true). Builds are unsigned (click "More info → Run anyway" on Windows); the AppImage requires `chmod +x`. See the [Desktop guide](apps/desktop/README.md).

## Table of Contents

- [Desktop App](#desktop-app)
- [Key Features](#key-features)
- [Deployment](#deployment)
- [Documentation](#documentation)
- [TODO](#todo)

## Key Features

- **Single-Server Model**: An application instance is a complete standalone server with custom text and voice rooms.
- **Voice Rooms**: Low-latency voice powered by WebRTC and the Mediasoup SFU, with noise suppression.
- **Camera & Screen Sharing**: Stream your camera or screen in voice rooms and calls.
- **Direct Messages & Calls**: Private one-to-one chats and calls.
- **Text Chat**: Rich-text messages with replies, reactions and file attachments.
- **Encrypted Messages**: Text messages are encrypted server-side at rest using AES-256-GCM.
- **Notifications**: Web Push and native desktop notifications.
- **PWA & Desktop Client**: Installable web app, plus a desktop app for Windows and Linux.
- **Roles & Administration**: `OWNER`, `ADMIN` and `USER` (`MEMBER`) roles, user management and invite-only registration.
- **Localization**: English and Russian.
- **Modern Monorepo**: Built with Angular (v22, Signals) and Taiga UI on the frontend, NestJS on the backend, Electron for desktop, and shared TypeScript schemas (Nx).

## Deployment

1. Copy `.env.example` to `.env` and set required variables:

   ```bash
   cp .env.example .env
   nano .env
   ```

2. Start the server:

### Option 1: Prebuilt Image (Recommended)

Run via [docker-compose.yml](docker-compose.yml):

```bash
docker compose up -d
```

### Option 2: Building from Source

Build and run via [docker-compose.build.yml](docker-compose.build.yml):

```bash
docker compose -f docker-compose.build.yml up -d --build
```

> [!IMPORTANT]
> **Initial OWNER Setup**: On a fresh install, a one-time token (valid for 5 minutes) is printed to the container logs (`docker compose logs`). It is required to register the initial `OWNER` account.

> [!IMPORTANT]
> **Voice Calls & HTTPS**:
>
> - **Ports & IP**: Forward UDP `40000-40100` and set `MEDIASOUP_ANNOUNCED_IP` in `.env` to your public IP/hostname.
> - **HTTPS Required**: Browsers strictly require HTTPS for audio devices to work.
> - See the [Networking & Deployment Guide](docs/NETWORKING.md) for reverse proxy (Caddy/Nginx) configurations.

## Documentation

- [Desktop client](apps/desktop/README.md)
- [Networking & Deployment Guide](docs/NETWORKING.md)
- [Contributing Guidelines](docs/CONTRIBUTING.md)
- [Security Policy](docs/SECURITY.md)
- [Password Recovery](docs/PASSWORD_RECOVERY.md)
- [User Management](docs/USER_MANAGEMENT.md)
- [Rooms](docs/ROOMS.md)
- [Message attachments](docs/ATTACHMENTS.md)
- [Message reactions](docs/MESSAGE_REACTIONS.md)
- [Frontend voice](docs/frontend/VOICE.md)
- [Frontend streaming](docs/frontend/STREAMING.md)
- [Frontend noise suppression](docs/frontend/NOISE_SUPPRESSION.md)

## TODO

### Video streaming — phase 4 (simulcast & adaptive)

- Simulcast encode layers on producers; `setPreferredLayers` per consumer (tile size / theatre focus)
- Bitrate caps tied to capture height; optional `maxIncomingBitrate` on recv transport
- Pause or reduce offscreen / hidden video consumers (adaptive downlink; align with local preview pause / theatre patterns)
- Optional viewer-side quality picker (layer selection when simulcast exists)
- Optional stream viewer count (needs signaling; not in phase 3)
- Codec auto-pick for screen (e.g. VP9/AV1) when all consumers `canConsume` — still no server transcode
- Mid-share height/FPS change via `replaceTrack` (stream quality dialog on tile / controls bar)

### Other

- Add common user dialog with short info and direct chat/call buttons
- Add invite emails (if email set), 2FA via email codes
- Add customizable roles (functions access) and groups (rooms access)
- Add emojis or/and customizable smile/sticker packs
- Swipe to reply
