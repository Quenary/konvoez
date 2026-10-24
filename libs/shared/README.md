# @konvoez/shared

Cross-app contracts for Konvoez: Zod schemas, inferred TypeScript types, domain enums, validation constants, and small shared helpers. Used by the NestJS backend, Angular frontend, Electron desktop, and client libraries so API and realtime payloads stay in sync.

## Scope & Capabilities

- **Zod schemas & types** (`src/schemas/`): auth, user (`userFullSchema` complete; `userSafeSchema` public omit of PII; `isOwner`, `roles`, `permissions`), profile, user management, roles (`roleSchema`, `createRoleSchema`, `updateRoleSchema`, `roleSummarySchema`, with `mentionable`), rooms (`isPrivate`, `allowedRoleIds`, `allowedUserIds`), text rooms (messages with `mentionSetSchema`, mention suggestion items), voice rooms and sessions, attachments, files, settings, invites, notifications, entity sync and user presence, public API, and custom fields
- **Domain enums** (`src/enums.ts`): granular permissions (`EPermission`, including `MENTION_EVERYONE`), room types, setting keys, attachment kinds, text/voice room and direct-call events, and entity-sync and user presence events
- **API errors** (`src/errors.ts`): `ApiErrorCode` enum (including role management and room access errors) and `apiErrorResponseSchema` / `TApiErrorResponse` wire format for HTTP responses and WebSocket error acks (`TWsAckError`)
- **Constants** (`src/const.ts`): username/password/message limits, attachment defaults and TTLs, invite and password-recovery bounds
- **Desktop bridge** (`src/desktop.ts`): IPC channel names (`EDesktopIpc`: commands, notifications, voice state), desktop commands, and Zod schemas for renderer ↔ main payloads
- **Helpers** (`src/text-room.ts`, `src/mentions.ts`, `src/room-access.ts`): shared permission and session utilities (e.g. message delete rules taking `isOwner` and `MODERATE_MESSAGES` into account, voice session keys), mention parsing/splitting/filtering helpers (`parseMentions`, `splitMentionSegments`, `diffMentionedUsers`, `isMessageMentioningUser`, `MENTION_EVERYONE`), and room access resolution (`canAccessRoomSnapshot`)
- **Tests** (`src/schemas/*.spec.ts`, `src/errors.spec.ts`, `src/mentions.spec.ts`, `src/room-access.spec.ts`): Vitest contract suites for Zod validation schemas, error codes, mention contracts, and desktop payloads via `nx test shared`

## Import Rules

- This is the lowest shared layer in the monorepo; never import other `@konvoez/*` packages or application code from here.
- Keep the library framework-free (TypeScript and `zod` only).
- Define request/response and wire-format shapes here once; wrap schemas with `createZodDto(...)` in the backend and import types/enums in the frontend and desktop instead of duplicating contracts.
