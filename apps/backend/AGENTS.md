# Backend Agent Guide

Guidelines for AI agents working in `apps/backend` — the NestJS API for Konvoez (self-hosted voice and text chat).

## Stack

- **NestJS 11** (modules, DI, guards, pipes, WebSockets)
- **MikroORM 7** with `defineEntity` schemas (SQLite default; MySQL/Postgres via `DB_ENGINE`)
- **nestjs-zod** + Zod schemas from `@konvoez/shared` for request/response DTOs
- **Socket.IO** gateways for realtime text/voice signaling
- **mediasoup** (WebRTC SFU) for voice rooms and direct calls
- **JWT** in HTTP-only cookies; passwords via Argon2
- **AES-256-GCM** message encryption at rest (`EncryptionService` + `MASTER_KEY`)

HTTP API prefix: `/api/v1`. Swagger: `/docs`. WS paths: `/ws/v1/text`, `/ws/v1/voice`.

## Layout

```
src/
  features/     # domain modules (auth, users, rooms, text-rooms, voice-rooms, …)
  shared/       # cross-cutting services, utils, tokens, base entity
  migrations/   # MikroORM migrations (explicit list in mikro-orm.config.ts)
  main.ts
  app.module.ts
  mikro-orm.config.ts
```

Typical feature files: `*.module.ts`, `*.controller.ts`, `*.service.ts`, `*.gateway.ts` (realtime), `*.entity.ts`, `*.dto.ts`, `*.spec.ts`.

Path aliases (prefer these over deep relative imports):

| Alias             | Points to      |
| ----------------- | -------------- |
| `@konvoez/shared` | `libs/shared`  |
| `@shared/*`       | `src/shared/*` |

## General

- Smallest change that fully solves the problem; do not refactor unrelated code.
- Drop unused variables and imports.
- Do not use `console.log`; use NestJS `Logger`.
- Prefer meaningful names over comments; comment only non-obvious intent or constraints.
- Every new file must end with a trailing newline.
- Never use deprecated APIs; replace them with the recommended alternative.
- For bug fixes, add the smallest failing test first when practical. Prefer unit tests with `@nestjs/testing`; E2E only for real multi-layer flows.
- Respect the threat model in `docs/SECURITY.md` (roles, invites, encryption, cookies).

## TypeScript

- Keep `strict` checking; avoid `any` (use `unknown` and narrow).
- Prefer inference when obvious; annotate when it clarifies intent.
- Prefer discriminated unions over boolean flag combinations.
- Prefer `satisfies` over `as` when checking object shapes.
- Prefer `readonly` and immutable updates unless controlled mutation is clearly better.
- Field order in classes: private → protected → public.
- Naming: PascalCase for classes, camelCase for members/variables.
- Injected / constructed dependencies: name the field after the injected symbol, camelCased (e.g. `UsersService` → `usersService`, `PasswordService` → `passwordService`). Do not shorten to `users`, `userService`, etc.

## NestJS

- Organize by **feature modules**, not by technical layer (no global `controllers/` / `services/` trees).
- Keep controllers thin: validate/auth → call service → return DTO. No business logic or ORM in controllers.
- Prefer **constructor injection**; avoid `ModuleRef.get()` / service-locator patterns.
- Providers are singletons by default; do not put request-mutable state on singleton services.
- Export only what other modules need. Prefer extracting shared logic over `forwardRef()` / circular modules.
- `@Global()` is already used for true cross-cutting modules (`SharedModule`, `AuthModule`, …); do not make every new module global.
- Throw Nest `HttpException` subclasses (`NotFoundException`, `ForbiddenException`, …) from services when appropriate; do not return ad-hoc `{ error }` objects for control flow.
- Use lifecycle hooks (`onModuleInit`, `onApplicationShutdown`, …) for async setup/cleanup; keep constructors fast. Shutdown hooks are enabled in `main.ts`.

### Modules & DI

- Register entities with `MikroOrmModule.forFeature([...])` inside the owning feature module.
- Cross-cutting infrastructure (config/`AppService`, password hashing, encryption, file storage) lives in `shared/` and is provided via `SharedModule`.
- Alternate implementations use injection tokens (e.g. `FileServiceInjectionToken`); follow that pattern when swapping backends.

### Auth & authorization

- Protect HTTP routes with `@UseGuards(AuthGuard)`.
- Current user: `@Author()` (set by the guard).
- Role-restrict with `@AuthGuardRoles([...])` when needed (`OWNER` / `ADMIN` / `MEMBER`).
- Do not invent a second auth mechanism; extend the existing guard/decorators.
- WebSocket gateways authenticate from handshake cookies via `AuthService` (same JWT cookies as HTTP).

### DTOs & validation

- Define Zod schemas in `@konvoez/shared`; wrap with `createZodDto(...)` in feature `*.dto.ts`.
- Global `ZodValidationPipe` is registered in `AppModule` — do not add `class-validator` / hand-rolled ValidationPipe.
- Document responses with `@ApiOkResponse` / Swagger decorators where existing controllers do.
- Map entities to API shapes via service `toDto` / `*AsDto` helpers; do not leak hidden fields (e.g. password hashes).

## Data & MikroORM

- Entities use `defineEntity` + `p.*` property builders; extend `KonvoezBaseEntitySchema` for `createdAt` / `updatedAt`.
- Inject `EntityRepository<T>` with `@InjectRepository`; obtain `EntityManager` from the repository when needed (`repo.getEntityManager()`, `em.fork()` for isolated work).
- Do not introduce a separate repository-class layer unless complexity clearly demands it — services own persistence here.
- Schema changes go through migrations under `src/migrations/`. Create them via CLI only — never hand-write migration files: `npm run migration:create -- --name DescriptiveSuffix`. The `--name` suffix is required (e.g. `PushSubscriptionNotifications` → `Migration20260923111848_PushSubscriptionNotifications`). After creating a migration, add it to `migrationsList` in `mikro-orm.config.ts` (required for the webpack bundle).
- Never enable ORM `synchronize` as a substitute for migrations in shared/prod paths.
- Encrypt message content through `EncryptionService` before persist; decrypt on read. Do not store plaintext chat bodies.
- Avoid N+1 queries: load needed relations deliberately; paginate large lists.

## Realtime & voice

- Text: `TextRoomsGateway` + `TextRoomsService`. Voice: `VoiceRoomsGateway` + mediasoup state services.
- Keep signaling contracts and event enums in `@konvoez/shared`; do not diverge payload shapes between client and server.
- Gateways handle connection lifecycle and fan-out; heavy persistence/encryption stays in services.
- Mediasoup / SFU state is process-local — treat it as sensitive runtime state, not something to casually serialize or share across instances.

## Testing

- Unit tests: `Test.createTestingModule` with mocked providers.
- Mock MikroORM at the module boundary when entity schema imports are noisy (see existing `*.spec.ts` patterns).
- Mock external I/O (S3, push, mediasoup) — do not hit real services in unit tests.
- Cover authz edge cases (roles, invites, owner bootstrap) when touching those paths.

## Change discipline

- Preserve existing architecture unless there is a strong reason to change it.
- Follow Conventional Commits when committing (`feat(backend): …`, `fix(backend): …`).
- After substantive edits, ensure lint/tests relevant to the touched area still pass.
- Env/secrets: never hard-code `MASTER_KEY`, `JWT_SECRET`, or storage credentials; read via `AppService` / env as existing code does.

## Resources

- [NestJS docs](https://docs.nestjs.com) — modules, providers, guards, pipes, websockets, testing
- [MikroORM docs](https://mikro-orm.io/docs) — entities, repositories, migrations
- [nestjs-zod](https://github.com/BenLorantfy/nestjs-zod) — DTO / validation integration
- Shared contracts: `libs/shared` (`@konvoez/shared`)
- Security model: `docs/SECURITY.md`
  )
