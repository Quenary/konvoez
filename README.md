# Konvoez

Konvoez is a self-hosted, single-server voice and text communication platform (Discord-like alternative where the deployed application instance acts as the server itself). It enables private communities and teams to create and manage custom text and voice rooms on self-hosted infrastructure.

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

### Option 1: Using Prebuilt Image (Recommended)

Run the prebuilt container image from GitHub Container Registry (`ghcr.io/quenary/konvoez:1`):

1. Copy `.env.example` to `.env` and configure your secrets and settings:

   ```bash
   cp .env.example .env
   ```

   > **Note**: `JWT_SECRET` and `MASTER_KEY` must be configured in `.env` for secure operation.

2. Start the application using `docker-compose.yml`:
   ```bash
   docker compose up -d
   ```

### Option 2: Building from Source

If you want to build the container directly from local source code:

```bash
docker compose -f docker-compose.build.yml up -d --build
```

### Important: Voice Calls Configuration

Forward UDP port range `40000-40100` on your router to the host machine running Docker, and set `MEDIASOUP_ANNOUNCED_IP` in `.env` to your public IP.

> [!IMPORTANT]
> **HTTPS Required for Voice/Microphone**: Modern browsers strictly require a **Secure Context** (`HTTPS` or `http://localhost`) to access microphone and audio devices via the MediaDevices API (`navigator.mediaDevices`). When accessing Konvoez over plain `HTTP` on a remote IP address (e.g., `http://192.168.x.x`), browsers will block microphone and media device access. For remote use, serve the application over HTTPS.

For a detailed explanation of network flows, external reverse proxy configurations (Nginx/Caddy), and host networking mode, see the [Networking & Deployment Guide](docs/NETWORKING.md).

## Documentation

- [Networking & Deployment Guide](docs/NETWORKING.md)
- [Contributing Guidelines](docs/CONTRIBUTING.md)
- [Security Policy](docs/SECURITY.md)

## TODO

- Add active voice room indication on narrow menu
- Add message assets (files)
- Add messages search
- Add connection state indication
- Add notifications
- Add customizable roles (functions access) and groups (rooms access)
- Add voice room component (visualization of peers on big screens like in discord)
- Add mute indication for other peers
- Add camera/screen sharing
