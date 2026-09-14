# Konvoez

Konvoez is a self-hosted, single-server voice and text communication platform (Discord-like alternative where the deployed application instance acts as the server itself). It enables private communities and teams to create and manage custom text and voice rooms on self-hosted infrastructure.

## Table of Contents

- [Key Features](#key-features)
- [Documentation](#documentation)
- [TODO](#todo)

## Key Features

- **Single-Server Model**: An application instance is a complete standalone server with custom text and voice rooms.
- **Encrypted Messages**: Text messages are encrypted server-side at rest using AES-256-GCM.
- **Real-Time Voice Channels**: Low-latency voice communication powered by WebRTC and Mediasoup SFU.
- **Three-Tier User Roles**: Built-in permission hierarchy with `OWNER`, `ADMIN`, and `USER` (`MEMBER`) roles.
- **Modern Monorepo**: Built with Angular (v19+, Signals) on the frontend, NestJS on the backend, and shared TypeScript schemas.

## Documentation

- [Contributing Guidelines](docs/CONTRIBUTING.md)
- [Security Policy](docs/SECURITY.md)
- [Backend Architecture & Guidelines](apps/backend/AGENTS.md)
- [Frontend Architecture & Guidelines](apps/frontend/AGENTS.md)

## TODO

- Add message assets (files)
- Add messages search
- Add connection state indication
- Add notifications
- Add customizable roles (functions access) and groups (rooms access)
- Add voice room component (visualization of peers on big screens like in discord)
- Add mute indication for other peers
- Add camera/screen sharing
