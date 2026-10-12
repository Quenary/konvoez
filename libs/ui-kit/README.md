# @konvoez/ui-kit

Lit UI primitives for Konvoez. Components use standard TC39 decorators, Shadow DOM, and Taiga UI design tokens inherited from the document.

## Components

- **Buttons & Spinners**: `k-button`, `k-spinner`
- **Form Controls**: `k-input`, `k-checkbox`, `k-hotkey-input`
- **Feedback**: `k-message`
- **Navigation & Layout**: `k-dialog-layout`, `k-dialog-actions`, `k-tabs`
- **Media**: `k-source-card`, `k-source-grid`

## Theme

Taiga UI variables are **not** duplicated in component styles. The desktop app compiles `src/theme/theme.less` (from `@taiga-ui/styles`) at build time into `dist/pages/host.css`. Dialog pages link that stylesheet so Lit components inherit `--tui-*` tokens through the shadow DOM.

- Dark mode follows the OS (`prefers-color-scheme: dark`).
- Typography uses system UI fonts (`--tui-typography-family-text` / `--tui-typography-family-display`).

After upgrading `@taiga-ui/styles`, re-run `npx nx run desktop:build` to refresh `host.css`.

## Import Rules

- Never import `electron`, `node:*` modules, `@angular/*`, or `@taiga-ui/*`.
- May import `@konvoez/client-shell`.
