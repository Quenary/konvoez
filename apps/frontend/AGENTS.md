# Frontend Agent Guide

Rules for `apps/frontend` — the Angular client for Konvoez. General rules (scope, TypeScript, tests, checks) are in the root `AGENTS.md`. Voice, streaming, audio pipelines and the chat message list are described in `docs/frontend/`.

## Stack

- **Angular 22** with Signals, **SCSS** and **Taiga UI**.
- **NgRx Store + Effects** for cross-cutting app state (`auth`) and **NgRx Signal Stores** for feature state.
- **ngx-translate** with YAML loaders, **Zod** schemas from `@konvoez/shared`, **Socket.IO** and **mediasoup-client**.

Use the workspace MCP servers when helpful: **angular-cli** (best practices, docs) and **taiga-ui** (component docs).

## Layout

```
src/app/
  core/        # guards, interceptors, tokens, app-wide services, initializers,
               # stores (stores, voice, chat), api
  features/    # route-level features (auth, rooms, text-room, voice-room, …)
  shared/      # reusable components, pipes, directives, helpers
```

| Alias             | Points to            |
| ----------------- | -------------------- |
| `@konvoez/shared` | `libs/shared`        |
| `@core/*`         | `src/app/core/*`     |
| `@features/*`     | `src/app/features/*` |
| `@shared/*`       | `src/app/shared/*`   |
| `@environments/*` | `src/environments/*` |

Use aliases instead of deep relative imports. Selector prefix is `app`. Components use external `.ts` + `.html` + `.scss` files unless they are trivial and already inline.

## Angular

- Components are standalone by default: do not set `standalone: true`. Always set `changeDetection: ChangeDetectionStrategy.OnPush`.
- Use `input()` / `output()` and `inject()`, not decorators and constructor injection.
- Use signals for local state; update with `set` / `update` and never mutate signal contents in place.
- In `computed()`, `effect()` and `linkedSignal()` **read every tracked signal first**, then branch or return. An early return or a short-circuit `||` / `&&` before later reads means those dependencies are not registered on that run.

```ts
// GOOD EXAMPLE
computed(() => {
  const active = this.activeCall();
  const rejoinable = this.rejoinableCall();
  const users = this.users();
  if (active) return active.interlocutor;
  return users[rejoinable?.callerId ?? 0] ?? null;
});
```

- Put host bindings in the `host` object, not in `@HostBinding` / `@HostListener`.
- Do not use `ngClass` / `ngStyle`; use `[class.foo]` / `[style.prop]`. A static `style=""` is fine for one or two values.
- Lazy-load feature routes with `loadComponent` and protect them with the functional guards `authGuard`, `unauthGuard`, `ownerGuard` or `permissionGuard(EPermission.X)`.

### Templates

- Use native control flow (`@if`, `@for`, `@switch`) and signals; use the `async` pipe only for Observables that are not signals.
- Do not call ordinary methods or functions from templates (bindings, interpolations, control flow, `host` bindings). They re-run on every change detection. Precompute values in `computed()` and read the signal. Event bindings such as `(click)="save()"` are fine.
- When a binding inside `@for` compares each item to one shared signal (the active tile, the selection), read that signal once with `@let` before the loop.

<!-- prettier-ignore -->
```html
<!-- GOOD EXAMPLE -->
@let focus = focusTile();
@for (tile of tiles(); track tile.key) {
  <button [class.active]="focus?.key === tile.key"></button>
}
```

- Format dates with `DayjsPipe` (`| dayjs`) from `@shared/pipes/dayjs.pipe`, not Angular `DatePipe`. The default format is locale-aware; pass a format string only when a specific layout is required.

## State

- **Local UI state**: component signals.
- **Feature or domain state**: NgRx `signalStore` (see `users.store.ts`, `rooms.store.ts`, `chat.store.ts`, `settings.store.ts`).
- **Cross-cutting app state**: NgRx Store + Effects (`auth`). Do not invent a third pattern for the same concern.
- Derived state goes in `computed()` / `withComputed` without side effects. Expose readonly views when outside code must not write.
- Services own imperative and realtime side effects (sockets, mediasoup, media devices); components and stores consume them. Keep HTTP clients thin (`*-api.service.ts`) and put orchestration in effects, stores or domain services.

## Forms and UI

- Use reactive forms with Zod schemas from `@konvoez/shared`: `createZodFieldValidator`, `createZodFormValidator` and `createZodError` (a `computed`, not a template function). Do not hand-write `Validators.*` when a shared schema exists.
- Prefer Taiga UI components over custom controls when they fit. Match existing SCSS patterns and mixins; do not add a new styling approach.
- User-facing strings go through ngx-translate (`TranslatePipe` / `TranslateService`), never hard-coded in templates.

## Testing

Vitest with Angular TestBed (`@angular/build:unit-test`).
