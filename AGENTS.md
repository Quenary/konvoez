---
trigger: always_on
---

This is the source code for the Konvoez application.

This guide outlines standard practices for AI agents working in this repository.

## Agent workflow (required)

Before proposing a plan, architecture, or **any** code edit in this repo:

1. Use the Read tool to load **every** document below that applies to the task (full file, not skim). If several apply, read all of them.
2. Do not rely on prior sessions or summaries in this file — linked docs are authoritative.
3. When your change affects behavior, configuration, architecture, or contracts between packages, **update the matching documentation in the same change** — do not leave docs stale.

- Repo-wide conventions, Nx, scripts, env — `docs/CONTRIBUTING.md`
- Security, auth, encryption, secrets — `docs/SECURITY.md`
- Backend, NestJS (`apps/backend`) — `apps/backend/AGENTS.md`
- Frontend, Angular (`apps/frontend`) — `apps/frontend/AGENTS.md`
- Desktop, Electron (`apps/desktop`) — `apps/desktop/README.md`, `docs/CONTRIBUTING.md` (Desktop)
- Shared contracts: Zod schemas, enums, types (`libs/shared`) — `libs/shared/README.md`
- Client shell: validation, adapters, i18n (`libs/client-shell`) — `libs/client-shell/README.md`, `docs/CONTRIBUTING.md` (Client Libraries Rules)
- Client UI kit, Lit primitives (`libs/ui-kit`) — `libs/ui-kit/README.md`, `docs/CONTRIBUTING.md` (Client Libraries Rules)
- Client dialogs, desktop Lit dialogs (`libs/client-dialogs`) — `libs/client-dialogs/README.md`, `docs/CONTRIBUTING.md` (Client Libraries Rules)

General and cross-cutting docs live in `docs/` (contributing, security, deployment, feature guides such as `docs/frontend/*`). App and library docs live beside the code. The root `README.md` is the product overview and doc index. Extend the matching doc above rather than duplicating long explanations in comments only.

## Code principles

Apply a principle only when it makes this change simpler. Do not reshape the code just to satisfy it.

- **SOLID, KISS, DRY, YAGNI.** Follow the design already in the touched code. Prefer a clear, small change over a new abstraction, a copied variant, or behavior the task does not need.
- **Tests.** Cover the important behavior of the change. A test must lock that behavior, not only call the code. Parameterize cases that differ by inputs and expected results instead of duplicating the test.
- Formatting, lint, and the rule that features and bug fixes come with tests are in `docs/CONTRIBUTING.md` (Code Changes, Tests). How to write tests in an app is in that app's guide from the list above.
