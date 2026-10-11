# @konvoez/client-dialogs

Desktop dialog implementations using Lit web components (`k-server-dialog`, `k-settings-dialog`, `k-source-picker-dialog`).

## Import rules

- Dialogs are framework-free web components communicating only via adapters defined in `@konvoez/client-shell`.
- Never import `electron`, `node:*`, `@angular/*`, or `@taiga-ui/*` directly in this library.
