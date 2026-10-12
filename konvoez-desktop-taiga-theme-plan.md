# Desktop: compiled Taiga theme instead of ui-kit token generator

Repo: Konvoez, current `next`.

**Work only in the working tree. Do not commit, push or create branches.** Eugene will commit everything himself as a single refactor commit.

## Changes

1. **Dependencies.** Add these to root `package.json` `devDependencies`, then run `npm install` to update the lockfile:
   - `"less": "4.8.1"`
   - `"@taiga-ui/styles": "5.26.0"`

2. **Theme source.** Create `libs/ui-kit/src/theme/theme.less`:

   ```less
   @import '@taiga-ui/styles/theme/variables.less';
   @import '@taiga-ui/styles/theme/palette.less';

   @media screen and (prefers-color-scheme: dark) {
     :root {
       color-scheme: dark;
       .tui-theme-dark();
     }
   }

   :root {
     --tui-typography-family-text: system-ui, sans-serif;
     --tui-typography-family-display: system-ui, sans-serif;
   }

   html,
   body {
     margin: 0;
     height: 100%;
     overflow: hidden;
     user-select: none;
     box-sizing: border-box;
     background: var(--tui-background-base);
     color: var(--tui-text-primary);
     font-family: var(--tui-typography-family-text);
   }
   *,
   *::before,
   *::after {
     box-sizing: inherit;
   }
   ```

   Dark mode follows the OS via `prefers-color-scheme`; pages never set `tuiTheme`.

3. **Compile at build.**
   - Create `apps/desktop/tools/compile-theme.mjs` exporting `async function compileTheme()`. It must:
     - call `less.render` on `theme.less` with `filename` set to that file, `paths: [<repo>/node_modules]` and `math: 'always'`;
     - throw if the CSS matches `/@font-face|url\(|@import/`;
     - return the CSS.
   - In `apps/desktop/build.mjs`:
     - remove the `execSync(...generate-tokens.mjs)` block and the `root-tokens.css` + `host-base.css` concatenation;
     - write `await compileTheme()` to `dist/pages/host.css`.

   The HTML files and the CSP stay unchanged.

4. **Components read inherited variables.**
   - In every element under `libs/ui-kit/src` and `libs/client-dialogs/src`, remove the `tokens` import and its entry in `static styles`.
   - Replace every `--tui-font-text` with `--tui-typography-family-text`.
   - Delete:
     - `libs/ui-kit/src/theme/tokens.ts`
     - `libs/ui-kit/src/theme/theme.ts`
     - `libs/ui-kit/src/theme/tokens.spec.ts`
     - `libs/ui-kit/src/theme/host-base.css`
     - any `@konvoez/ui-kit/theme` path alias (root `tsconfig.json`, `apps/desktop/tsconfig.json`, vitest configs).

5. **Remove the generator.**
   - Delete `libs/ui-kit/scripts/generate-tokens.mjs` (and the `scripts/` folder if it ends up empty) and `libs/ui-kit/src/theme/generated/`.
   - Remove the `generate-tokens` target and every `dependsOn` that references it from:
     - `libs/ui-kit/project.json`
     - `libs/client-dialogs/project.json`
     - `apps/desktop/project.json`
   - In root `package.json`, delete the `tokens:ui-kit` script and set `"prepare": "husky"`.
   - In `.gitignore`, remove `libs/ui-kit/src/theme/generated/`.

6. **Docs.** Update `libs/ui-kit/README.md` and `apps/desktop/README.md`:
   - the theme is Taiga LESS compiled at desktop build;
   - dark mode follows the OS;
   - fonts are the system fonts.

## Tests

- New `apps/desktop/src/pages/theme.spec.ts` (node environment). It calls `compileTheme()` and asserts:
  - these variables are present: `--tui-background-base:`, `--tui-text-primary:`, `--tui-background-accent-1:`, `--tui-radius-m:`, `--tui-height-m:`, `--tui-typography-family-text: system-ui`;
  - a `prefers-color-scheme: dark` block defines `--tui-background-base`;
  - there is no `@font-face`, `url(` or `@import`.
- New `libs/ui-kit/src/theme/no-local-tokens.spec.ts` (node environment). It reads every `*.ts` under `libs/ui-kit/src` and `libs/client-dialogs/src` and asserts none matches `/--tui-[a-z0-9-]+\s*:/`.

## Checks (all must pass)

- `npm ci`
- `npx nx run-many -t test eslint:lint -p desktop ui-kit client-shell client-dialogs`
- `npx tsc -p apps/desktop/tsconfig.app.json --noEmit`
- `npx tsc -p libs/ui-kit/tsconfig.lib.json --noEmit` and `npx tsc -p libs/client-dialogs/tsconfig.lib.json --noEmit`
- `npx nx run desktop:build`:
  - the page-bundle guard passes;
  - `apps/desktop/dist/pages/host.css` exists and is about 15–16 KB.
- `rg -n "generate-tokens|tokens:ui-kit|theme/generated|--tui-font-text" --glob '!node_modules' --glob '!CHANGELOG*' .` finds nothing.

When done, leave all changes uncommitted and list the changed files.
