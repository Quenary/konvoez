# desktop-ui

Standalone Angular application rendering local Electron dialog windows for the desktop client: server configuration, settings, media source picker, and update progress dialog.

## Architecture

- Standalone zoneless Angular application (`@angular/build:application`) with hash location routing (`#/server`, `#/settings`, `#/picker`, `#/updater`).
- Styled with Taiga UI design tokens and system UI fonts.
- Built without inline scripts under a strict Content Security Policy (`connect-src 'none'`).
- Communicates with Electron solely via `IKonvoezLocalBridge` injected through `KONVOEZ_LOCAL_BRIDGE`.

## Import Rules

- May import `@konvoez/shared` and `@konvoez/client-shell`.
- May import `@taiga-ui/*` component libraries.
- Must not import `apps/frontend`, NgRx, auth services, or Node-specific modules.

## Conventions

For Angular and Taiga UI coding rules and component conventions, see [apps/frontend/AGENTS.md](../frontend/AGENTS.md).
