---
trigger: always_on
---

This is the source code for the Konvoez application.

This guide outlines standard practices for AI agents working in this repository.

This is a NX monorepo with:

- backend written on NestJS in 'apps/backend'
- frontend written on Angular in 'apps/frontend'
- shared library written on TS in 'libs/shared'
- desktop client app written on Electron and TS in 'apps/desktop'

## Agent workflow (required)

Before proposing a plan, architecture, or **any** code edit in this repo:

1. Use the Read tool to load **every** document that applies to the task (full file, not skim).
2. Do not rely on prior sessions or summaries in this file — linked docs are authoritative.

| Task touches                            | Read first                               |
| --------------------------------------- | ---------------------------------------- |
| Repo-wide conventions, Nx, scripts, env | `docs/CONTRIBUTING.md`                   |
| Security, auth, encryption, secrets     | `docs/SECURITY.md`                       |
| `apps/backend/**`                       | `apps/backend/AGENTS.md`                 |
| `apps/frontend/**`                      | `apps/frontend/AGENTS.md`                |
| `apps/desktop/**`                       | `docs/CONTRIBUTING.md` (Desktop section) |

If multiple rows apply, read **all** of them before planning.

## Key documentation (authoritative)

- [Contributing Guidelines](docs/CONTRIBUTING.md)
- [Security Policy](docs/SECURITY.md)
- [Backend](apps/backend/AGENTS.md)
- [Frontend](apps/frontend/AGENTS.md)
