# Backend Agent Guide

Rules for `apps/backend` — the NestJS API for Konvoez. General rules (scope, TypeScript, tests, checks) are in the root `AGENTS.md`.

## Stack

- **NestJS 11**, **MikroORM 7** with `defineEntity` schemas. SQLite is the supported engine; `DB_ENGINE` keeps the option for other drivers open.
- **nestjs-zod** with Zod schemas from `@konvoez/shared` for DTOs.
- **Socket.IO** gateways and **mediasoup** (WebRTC SFU).
- **JWT** in HTTP-only cookies, **Argon2** passwords, **AES-256-GCM** message encryption at rest (`EncryptionService`).

HTTP prefix `/api/v1`, Swagger `/docs`. WebSocket paths: `/ws/v1/text`, `/ws/v1/voice`, `/ws/v1/sync`, `/ws/v1/notifications`.

## Layout

```
src/
  features/     # domain modules (auth, users, rooms, text-rooms, voice-rooms, …)
  shared/       # cross-cutting services, utils, tokens, base entity
  migrations/   # MikroORM migrations (explicit list in mikro-orm.config.ts)
```

Path aliases: `@konvoez/shared` → `libs/shared`, `@shared/*` → `src/shared/*`. Use them instead of deep relative imports.

## Architecture

The backend is a **modular monolith** in a single process. Organize by feature modules, not by technical layers.

- **Boundaries**: a feature module is a bounded context that owns its domain logic, persistence and validation. Other modules use only its exported services or facades.
- **Single entity owner**: exactly one module owns an entity and registers it with `MikroOrmModule.forFeature([Entity])`. Other modules never register it and never query it through the ORM (`em.find(ForeignEntity)`); they call the owner's public methods (`UsersService.findByIds`, `PermissionsFacade.findRolesByIds`).
- **Facades**: a subsystem that spans several entities exposes one facade (`PermissionsFacade`, `RoomsFacade`) and consumers depend only on it.
- **Domain events**: cross-module side effects and realtime fan-out go through `EventEmitter2`. Services emit with the typed helpers in the feature's `*.events.ts` (built on `createDomainEventEmitter` from `shared/events/`); gateways and listeners subscribe with `@OnEvent`. Event enums and wire payloads live in `@konvoez/shared`.
- **No transport in domain services**: never inject a gateway (`TextRoomsGateway`, `EntitySyncGateway`, …) or `NotificationsService` into another feature just to notify. Emit an event instead.
- **Shared infrastructure** (`AppService`, password hashing, encryption, file storage) lives in `shared/` and is provided by `SharedModule`. Alternative implementations use injection tokens (`FileServiceInjectionToken`).

## NestJS conventions

- Controllers stay thin: validate/auth → call a service → return a DTO. Business logic and ORM access belong to services.
- Use constructor injection. Do not use `ModuleRef.get()` or other service locators.
- Export only what other modules need. Extract shared logic instead of using `forwardRef()`.
- `@Global()` is for true cross-cutting modules (`SharedModule`, `AuthModule`). Do not make new feature modules global.
- Services throw `AppException` with an `ApiErrorCode`; do not return ad-hoc `{ error }` objects for control flow.
- Log with the NestJS `Logger`, not `console.log`.

### Auth and authorization

- Protect HTTP routes with `@UseGuards(AuthGuard)`, read the user with `@Author()`, and require permissions with `@RequirePermissions([EPermission…])`.
- Resolve roles and permissions only through `PermissionsFacade`. It applies default roles (`isDefault: true`) on top of assigned ones. The instance owner (`isOwner: true`) bypasses permission and private room checks.
- Check room access with `RoomsFacade.canAccessRoom` or `assertCanAccessRoom` in both HTTP and WebSocket handlers.
- Gateways authenticate from the handshake cookies via `AuthService`, the same JWT cookies as HTTP.

### DTOs and validation

- Define Zod schemas in `@konvoez/shared` and wrap them with `createZodDto(...)` in the feature `*.dto.ts`.
- The global `ZodValidationPipe` is registered in `AppModule`. Do not add `class-validator` or a custom ValidationPipe.
- Map entities to API shapes with the service `toDto` / `*AsDto` helpers so hidden fields (password hashes) never leak. Add Swagger decorators where neighboring controllers do.

## Data and MikroORM

- Entities use `defineEntity` with `p.*` builders and extend `KonvoezBaseEntitySchema`.
- Inject `EntityRepository<T>` with `@InjectRepository`; get the `EntityManager` from the repository (`em.fork()` for isolated work). Services own persistence; do not add repository classes unless complexity clearly demands it.
- Schema changes go through migrations in `src/migrations/`, created only with the CLI, never by hand: `npm run migration:create -- --name DescriptiveSuffix` (the suffix is required). Then add the new migration to `migrationsList` in `mikro-orm.config.ts`, which the webpack bundle needs. Never use ORM `synchronize` instead of migrations.
- Message content is encrypted through `EncryptionService` before persisting and decrypted on read. Plaintext chat bodies are never stored.

## Realtime and voice

- Text: `TextRoomsGateway` + `TextRoomsService`. Voice: `VoiceRoomsGateway` + mediasoup state services. Entity sync: `EntitySyncGateway`. Notification sockets: `NotificationsGateway`.
- Gateways handle connection lifecycle and fan-out; heavy persistence and encryption stay in services.
- Keep signaling contracts and event enums in `@konvoez/shared`, so client and server payloads do not diverge.
- Mediasoup state is process-local runtime state. Do not serialize it or share it across instances.
- Marking messages read is idempotent: `POST /text-rooms/read` inserts only missing records and emits `MESSAGES_READ` for newly read messages. `POST /text-rooms/read-all` accepts exactly one of `roomId` or `recipientId` and marks messages up to the newest one at request start. Both publish `UNREAD_COUNTS_CHANGED`. Keep these effects in `TextRoomsService` events and `TextRoomsGateway` fan-out. Client-side behavior: [Chat reading](../../docs/CHAT_READING.md).

## Testing

Jest with `@nestjs/testing`.

- Build units with `Test.createTestingModule` and mocked providers. Mock MikroORM at the module boundary when entity imports are noisy (see existing `*.spec.ts`).
- Mock external I/O (S3, push, mediasoup); unit tests never reach real services.
- When touching authorization paths (roles, invites, owner bootstrap), cover their edge cases.
