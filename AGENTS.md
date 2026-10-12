---
trigger: always_on
---

This is the source code for the Konvoez application.

This guide outlines standard practices for AI agents working in this repository.

This is a NX monorepo with:

- backend written on NestJS in `apps/backend`
- frontend written on Angular in `apps/frontend`
- desktop client app written on Electron and TS in `apps/desktop`
- shared contracts (Zod schemas, enums, types) in `libs/shared`
- client shell (validation, adapters, i18n) in `libs/client-shell`
- client UI kit (Lit primitives) in `libs/ui-kit`
- client dialogs (desktop Lit dialogs) in `libs/client-dialogs`

## Agent workflow (required)

Before proposing a plan, architecture, or **any** code edit in this repo:

1. Use the Read tool to load **every** document that applies to the task (full file, not skim).
2. Do not rely on prior sessions or summaries in this file — linked docs are authoritative.
3. When your change affects behavior, configuration, architecture, or contracts between packages, **update the matching documentation in the same change** — do not leave docs stale.

| Task touches                            | Read first                                                                       |
| --------------------------------------- | -------------------------------------------------------------------------------- |
| Repo-wide conventions, Nx, scripts, env | `docs/CONTRIBUTING.md`                                                           |
| Security, auth, encryption, secrets     | `docs/SECURITY.md`                                                               |
| `apps/backend/**`                       | `apps/backend/AGENTS.md`                                                         |
| `apps/frontend/**`                      | `apps/frontend/AGENTS.md`                                                        |
| `apps/desktop/**`                       | `apps/desktop/README.md`, `docs/CONTRIBUTING.md` (Desktop section)               |
| `libs/shared/**`                        | `libs/shared/README.md`                                                          |
| `libs/client-shell/**`                  | `libs/client-shell/README.md`, `docs/CONTRIBUTING.md` (Client Libraries Rules)   |
| `libs/ui-kit/**`                        | `libs/ui-kit/README.md`, `docs/CONTRIBUTING.md` (Client Libraries Rules)         |
| `libs/client-dialogs/**`                | `libs/client-dialogs/README.md`, `docs/CONTRIBUTING.md` (Client Libraries Rules) |

If multiple rows apply, read **all** of them before planning.

### Keeping documentation in sync

- **General / cross-cutting docs** live in `docs/` (contributing, security, deployment, feature guides such as `docs/frontend/*`).
- **App and library docs** live beside the code: `apps/*/AGENTS.md`, `apps/*/README.md`, `libs/*/README.md`, and the root `README.md` for top-level product overview and doc index.
- Use the table above and **Key documentation** to find the authoritative file; extend or add sections there rather than duplicating long explanations in comments only.

## Key documentation (authoritative)

- [Contributing Guidelines](docs/CONTRIBUTING.md)
- [Security Policy](docs/SECURITY.md)
- [Backend](apps/backend/AGENTS.md)
- [Frontend](apps/frontend/AGENTS.md)
- [Desktop](apps/desktop/README.md)
- [Shared](libs/shared/README.md)
- [Client shell](libs/client-shell/README.md)
- [UI kit](libs/ui-kit/README.md)
- [Client dialogs](libs/client-dialogs/README.md)
