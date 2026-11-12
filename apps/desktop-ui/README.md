# desktop-ui

Standalone Angular application rendering local Electron dialog windows for the desktop client: server configuration, settings, media source picker, and update progress dialog.

## Architecture

- Standalone zoneless Angular application (`@angular/build:application`) with hash location routing (`#/server`, `#/settings`, `#/picker`, `#/updater`).
- Styled with the Taiga UI theme and system UI fonts. `taiga-ui-fonts.less` is not loaded.
- Built without inline scripts under a strict Content Security Policy (`connect-src 'none'`).
- Communicates with Electron solely via `IKonvoezLocalBridge` injected through `KONVOEZ_LOCAL_BRIDGE` (`app.config.ts`). The production factory reads `window.konvoezLocal`.
- The server dialog stores each added server as its origin in `localStorage` on the device. An invalid address is rejected and is not stored. Adding an address does not connect. Joining a saved address uses `server.saveServer`, the same path as the typed address.

## Local preview

`npx nx serve desktop-ui` serves the dialogs on port 6201 with an in-memory bridge (`local-bridge.mock.ts`). Routes: `#/server`, `#/settings`, `#/picker`, `#/updater`. The mock is limited to the `local` build configuration and is not included in `desktop:build` or `desktop:serve`.

## Import Rules

- May import `@konvoez/shared` and `@konvoez/client-shell`.
- May import `@taiga-ui/*` component libraries.
- Must not import `apps/frontend`, NgRx, auth services, or Node-specific modules.

## Conventions

For Angular and Taiga UI coding rules and component conventions, see [apps/frontend/AGENTS.md](../frontend/AGENTS.md).
