# @konvoez/shared

Cross-app contracts for Konvoez: Zod schemas, inferred TypeScript types, domain enums, validation constants, and small shared helpers. Used by the NestJS backend, Angular frontend, Electron desktop, and client libraries so API and realtime payloads stay in sync.

## Scope & Capabilities

- **Zod schemas & types** (`src/schemas/`): auth (password recovery and 2FA), user (`userFullSchema` complete with `emailVerified` and `pendingEmail`; `userSafeSchema` public omit of PII; `isOwner`, `roles`, `permissions`), profile (including email verification and email change), user management, roles (`roleSchema`, `createRoleSchema`, `updateRoleSchema`, `roleSummarySchema`, with `mentionable`), rooms (`isPrivate`, `allowedRoleIds`, `allowedUserIds`), text rooms (messages with `mentionSetSchema`, mention suggestion items), voice rooms and sessions, attachments, files, settings, invites (`inviteCreateSchema` with `sendEmail`, `inviteSchema` with `emailSent`, `emailSentAt`, `url` and `emailSendFailed`), notifications, entity sync and user presence, public API (`smtpConfigured`, `appUrlConfigured`), and custom fields
- **Domain enums** (`src/enums.ts`): granular permissions (`EPermission`, including `MENTION_EVERYONE` and `MOVE_MEMBERS`), room types, setting keys (`ESettingKey`), attachment kinds, text/voice room (`MOVE_MEMBER`, `MOVED`) and direct-call events, and entity-sync and user presence events
- **API errors** (`src/errors.ts`): `ApiErrorCode` enum (including role management, room access, and email verification errors) and `apiErrorResponseSchema` / `TApiErrorResponse` wire format for HTTP responses and WebSocket error acks (`TWsAckError`)
- **Constants** (`src/const.ts`): username/password/message limits, attachment defaults and TTLs, invite (including resend cooldown), password-recovery, and email verification bounds
- **Desktop bridge** (`src/desktop.ts`): IPC channel names (`EDesktopIpc`: commands, notifications, voice state), desktop commands, and Zod schemas for renderer ↔ main payloads
- **Helpers** (`src/text-room.ts`, `src/mentions.ts`, `src/room-access.ts`, `src/invite.ts`): shared permission and session utilities (e.g. message delete rules taking `isOwner` and `MODERATE_MESSAGES` into account, voice session keys), mention parsing/splitting/filtering helpers (`parseMentions`, `splitMentionSegments`, `diffMentionedUsers`, `isMessageMentioningUser`, `MENTION_EVERYONE`), and room access resolution (`canAccessRoomSnapshot`), and invite link building (`buildInviteUrl`)
- **Tests** (`src/schemas/*.spec.ts`, `src/errors.spec.ts`, `src/mentions.spec.ts`, `src/room-access.spec.ts`): Vitest contract suites for Zod validation schemas, error codes, mention contracts, and desktop payloads via `nx test shared`

## Import Rules

- This is the lowest shared layer in the monorepo; never import other `@konvoez/*` packages or application code from here.
- Keep the library framework-free (TypeScript and `zod` only).
- Define request/response and wire-format shapes here once; wrap schemas with `createZodDto(...)` in the backend and import types/enums in the frontend and desktop instead of duplicating contracts.
