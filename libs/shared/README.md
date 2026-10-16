# @konvoez/shared

Cross-app contracts for Konvoez: Zod schemas, inferred TypeScript types, domain enums, validation constants, and small shared helpers. Used by the NestJS backend, Angular frontend, Electron desktop, and client libraries so API and realtime payloads stay in sync.

## Scope & Capabilities

- **Zod schemas & types** (`src/schemas/`): auth, user, profile, user management, rooms, text rooms, voice rooms and sessions, attachments, files, settings, invites, notifications, entity sync, public API, and custom fields
- **Domain enums** (`src/enums.ts`): roles, room types, setting keys, attachment kinds, text/voice room and direct-call events, and entity-sync events
- **API errors** (`src/errors.ts`): `ApiErrorCode` enum and `ApiErrorResponse` wire format for HTTP responses and WebSocket error acks
- **Constants** (`src/const.ts`): username/password/message limits, attachment defaults and TTLs, invite and password-recovery bounds
- **Desktop bridge** (`src/desktop.ts`): IPC channel names (`EDesktopIpc`: commands, notifications, voice state), desktop commands, and Zod schemas for renderer ↔ main payloads
- **Helpers** (`src/text-room.ts`): shared permission and session utilities (e.g. message delete rules, voice session keys)
- **Tests** (`src/schemas/*.spec.ts`, `src/errors.spec.ts`): Vitest contract suites for Zod validation schemas, error codes, and desktop payloads via `nx test shared`

## Import Rules

- This is the lowest shared layer in the monorepo; never import other `@konvoez/*` packages or application code from here.
- Keep the library framework-free (TypeScript and `zod` only).
- Define request/response and wire-format shapes here once; wrap schemas with `createZodDto(...)` in the backend and import types/enums in the frontend and desktop instead of duplicating contracts.
