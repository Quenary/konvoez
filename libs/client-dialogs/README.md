# @konvoez/client-dialogs

Desktop dialog implementations using Lit web components (`k-server-dialog`, `k-settings-dialog`, `k-source-picker-dialog`).

## Dialogs

- `k-server-dialog`: Server URL configuration and connection validation dialog.
- `k-settings-dialog`: Desktop client preferences, global hotkeys, and autostart dialog.
- `k-source-picker-dialog`: Screen share display and window source picker dialog.

## Import Rules

- Dialogs are framework-free web components communicating only via adapters defined in `@konvoez/client-shell`.
- Never import `electron`, `node:*`, `@angular/*`, or `@taiga-ui/*` directly in this library.
- May import `@konvoez/client-shell`, `@konvoez/ui-kit`, and `@konvoez/shared`.
