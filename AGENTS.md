---
trigger: always_on
---

This is the source code for the Konvoez application.

This guide outlines standard practices for AI agents working in this repository. App guides (`apps/*/AGENTS.md`) add rules on top of it and do not repeat it.

## Agent workflow (required)

Before proposing a plan, architecture, or **any** code edit in this repo:

1. Use the Read tool to load **every** document below that applies to the task (full file, not skim). If several apply, read all of them.
2. Do not rely on prior sessions or summaries in this file — linked docs are authoritative.
3. When your change affects behavior, configuration, architecture, or contracts between packages, **update the matching documentation in the same change** — do not leave docs stale. Follow [Documentation style](#documentation-style).

- Repo-wide conventions, Nx, scripts, env — `docs/CONTRIBUTING.md`
- Security, auth, encryption, secrets — `docs/SECURITY.md`
- Backend, NestJS (`apps/backend`) — `apps/backend/AGENTS.md`
- Frontend, Angular (`apps/frontend`) — `apps/frontend/AGENTS.md`
- Frontend voice, streaming, audio pipeline — `docs/frontend/VOICE.md`, `docs/frontend/STREAMING.md`, `docs/frontend/NOISE_SUPPRESSION.md`
- Desktop, Electron (`apps/desktop`) — `apps/desktop/README.md`, `docs/CONTRIBUTING.md` (Desktop)
- Shared contracts: Zod schemas, enums, types (`libs/shared`) — `libs/shared/README.md`
- Client shell: validation, adapters, i18n (`libs/client-shell`) — `libs/client-shell/README.md`, `docs/CONTRIBUTING.md` (Client Libraries Rules)
- Client UI kit, Lit primitives (`libs/ui-kit`) — `libs/ui-kit/README.md`, `docs/CONTRIBUTING.md` (Client Libraries Rules)
- Client dialogs, desktop Lit dialogs (`libs/client-dialogs`) — `libs/client-dialogs/README.md`, `docs/CONTRIBUTING.md` (Client Libraries Rules)
- Feature behavior (rooms, mentions, attachments, reactions, chat reading, user management, password recovery) — the matching `docs/*.md`
- Networking, WebRTC ports, Docker — `docs/NETWORKING.md`

General and cross-cutting docs live in `docs/`. App and library docs live beside the code. The root `README.md` is the product overview and doc index. Extend the matching doc above rather than duplicating long explanations in comments only.

## Code principles

Apply a principle only when it makes this change simpler. Do not reshape the code just to satisfy it.

- **SOLID, KISS, DRY, YAGNI.** Follow the design already in the touched code. Prefer a clear, small change over a new abstraction, a copied variant, or behavior the task does not need.
- **Scope.** Make the smallest change that fully solves the problem. Do not refactor unrelated code. Keep the existing architecture unless there is a strong reason to change it.
- **Comments.** Only for non-obvious intent or constraints. Do not use deprecated APIs.

## Documentation style

Keep every doc (`README.md`, `docs/*`, app and library docs) in the style of the existing ones when creating or updating it.

- **Compact and readable.** Short sections, lists and tables instead of long prose. Extend an existing doc rather than adding a new one, and remove text that the change made stale.
- **Business logic and flow only.** Describe what the feature does, the rules and permissions, and how the parts interact. Do not document request/response schemas, DTO fields, error codes, timeouts, magic numbers, algorithm internals or file-by-file code maps. The code, the shared Zod schemas and Swagger are the source for those.
- **Technical voice.** Third person, present tense, one style everywhere: "The app supports…", "The server stores…". Do not address the reader ("You can…") and do not use marketing wording.
- **Diagrams.** Show flows, state decisions, and component relations with Mermaid (`flowchart`, `sequenceDiagram`) instead of describing them in paragraphs. Keep each diagram small and make sure it parses.
- **Language and format.** English. Wrap file, class and setting names in backticks. Run Prettier on changed docs and keep relative links and anchors valid.

## TypeScript

These rules apply to every project, specs included.

- Keep `strict` checking. No `any` or `as any`. Prefer `unknown` plus narrowing; when a cast is unavoidable, use `as unknown as Something` or a typed guard.
- Prefer `satisfies` over `as` for shape checks, discriminated unions over combinations of boolean flags, and `readonly` with immutable updates unless controlled mutation is clearly better.
- Class member order: `inject()` fields, other fields, constructor, methods. Inside each group go from `public` to `protected` to `private`.
- Name an injected dependency after its type, camelCased: `HttpClient` → `httpClient`, `UsersService` → `usersService`. Do not shorten it (`http`, `users`, `userService`).

## Tests

- **What to test.** Cover the important behavior of the change. A test must lock that behavior, not only call the code. Parameterize cases that differ by inputs and expected results instead of duplicating the test.
- **Bug fixes.** Add the smallest failing test first when practical. Prefer unit or integration tests; use E2E only for real multi-layer flows.
- **Internals.** Reach private or protected members through an index signature (`service['cleanup']()`), which keeps the real types. Do not cast the whole instance with `as unknown as { … }` or `as any`.
- **Mocks.** Use typed mock objects and keep references to them. Do not cast injected instances to `any`.
- How to write tests in an app is in that app's guide from the list above.

## Checks

After substantive edits, run the checks for the touched projects: tests, ESLint and Prettier. Commands and project names are in `docs/CONTRIBUTING.md` (Tests). Commit messages follow Conventional Commits with the project scope (see Commits and releases there).
