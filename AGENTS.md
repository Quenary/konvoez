---
trigger: always_on
---

This is the source code for the Konvoez application.

This guide outlines standard practices for AI agents working in this repository.

This is a NX monorepo with:
- backend written on NestJS in 'apps/backend'
- frontend written on Angular in 'apps/frontend'
- shared library written on TS in 'libs/shared'

This repository uses conventional commits, e.g.
```md
feat(backend): file storage

+ added base file service
+ added user avatar service

Closes #123
Related to #444
```

## Key Documentation

- [Backend](apps/backend/AGENTS.md)
- [Frontend](apps/frontend/AGENTS.md)