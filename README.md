# Konvoez

Konvoez is a self-hosted, single-server voice and text communication platform (Discord-like alternative where the deployed application instance acts as the server itself). Designed for friends to hang out, not for production use.

## Table of Contents

- [Key Features](#key-features)
- [Deployment](#deployment)
- [Documentation](#documentation)
- [TODO](#todo)

## Key Features

- **Single-Server Model**: An application instance is a complete standalone server with custom text and voice rooms.
- **Encrypted Messages**: Text messages are encrypted server-side at rest using AES-256-GCM.
- **Real-Time Voice Channels**: Low-latency voice communication powered by WebRTC and Mediasoup SFU.
- **Three-Tier User Roles**: Built-in permission hierarchy with `OWNER`, `ADMIN`, and `USER` (`MEMBER`) roles.
- **Modern Monorepo**: Built with Angular (v19+, Signals) on the frontend, NestJS on the backend, and shared TypeScript schemas.

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

- [Networking & Deployment Guide](docs/NETWORKING.md)
- [Contributing Guidelines](docs/CONTRIBUTING.md)
- [Security Policy](docs/SECURITY.md)
- [Password Recovery](docs/PASSWORD_RECOVERY.md)
- [User Management](docs/USER_MANAGEMENT.md)
- [Rooms](docs/ROOMS.md)
- [Message attachments](docs/ATTACHMENTS.md)
- [Frontend voice](docs/frontend/VOICE.md)
- [Frontend streaming](docs/frontend/STREAMING.md)

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

- Add common user dialog with short info direct chat/call buttons
- Add emojis or/and customizable smile/sticker packs
- Add connection state indication
- Add mute indication for other peers
- Add customizable roles (functions access) and groups (rooms access)
- Add invite emails (if email set), 2FA via email codes
