# @konvoez/ui-kit

Lit UI primitives and theme tokens for Konvoez. Components use standard TC39 decorators, Shadow DOM, and Taiga UI design tokens.

## Components

- **Buttons & Spinners**: `k-button`, `k-spinner`
- **Form Controls**: `k-input`, `k-checkbox`, `k-hotkey-input`
- **Feedback**: `k-message`
- **Navigation & Layout**: `k-dialog-layout`, `k-dialog-actions`, `k-tabs`
- **Media**: `k-source-card`, `k-source-grid`

## Theme tokens

Color tokens are **not** duplicated in this repo. They are generated from the same Taiga theme as the Angular frontend: `@taiga-ui/styles/mixins/theme/palette.less` (`.tui-theme-light()` / `.tui-theme-dark()`).

```bash
npm run tokens:ui-kit
```

This writes (gitignored):

- `src/theme/generated/tokens.ts` — Lit `:host` variables for Shadow DOM components
- `src/theme/generated/root-tokens.css` — `:root` variables for document-level styling

Committed helpers:

- `src/theme/tokens.ts` — re-exports `generated/tokens` for `@konvoez/ui-kit/theme`
- `src/theme/host-base.css` — dialog page layout only (`html` / `body`); desktop build concatenates it with `root-tokens.css` into `dist/pages/host.css`

After upgrading `@taiga-ui/*`, regenerate tokens. `prepare` and Nx targets `ui-kit:generate-tokens`, `ui-kit:test`, `desktop:build`, and `desktop:serve` run generation automatically.

## Import Rules

- Never import `electron`, `node:*` modules, `@angular/*`, or `@taiga-ui/*`.
- May import `@konvoez/client-shell`.
