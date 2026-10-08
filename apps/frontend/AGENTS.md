# Frontend Agent Guide

Guidelines for AI agents working in `apps/frontend` — the Angular client for Konvoez (self-hosted voice and text chat).

## Stack

- **Angular 22+** (standalone + OnPush by default — do not set `standalone: true`; keep explicit `ChangeDetectionStrategy.OnPush`)
- **SCSS** for styles (not LESS/CSS)
- **Taiga UI** for UI components
- **NgRx Store + Effects** for cross-cutting app state (`auth`)
- **NgRx Signal Stores** for feature/domain state (root stores live in `core/stores`, `core/voice` and `core/chat`, plus feature stores where appropriate)
- **ngx-translate** with YAML loaders
- **Zod** schemas from `@konvoez/shared` for forms and shared contracts
- **Socket.IO** + **mediasoup-client** for realtime voice/text

Use the workspace MCP servers when helpful: **angular-cli** (best practices, docs, examples) and **taiga-ui** (component docs and examples).

## Layout

```
src/app/
  core/        # guards, interceptors, tokens, app-wide services, initializers
               # (api, audio, chat, guards, initializers, interceptors, services, stores, voice)
  features/    # route-level features (auth, rooms, text-room, voice-room, …)
  shared/      # reusable components, pipes, directives, helpers
```

Path aliases (prefer these over deep relative imports):

| Alias             | Points to            |
| ----------------- | -------------------- |
| `@konvoez/shared` | `libs/shared`        |
| `@core/*`         | `src/app/core/*`     |
| `@features/*`     | `src/app/features/*` |
| `@shared/*`       | `src/app/shared/*`   |
| `@environments/*` | `src/environments/*` |

Selector prefix: `app`. Component files: `.ts` + `.html` + `.scss` (+ `.spec.ts` when tested). Keep templates/styles external unless the component is trivial and already inline.

## General

- Smallest change that fully solves the problem; do not refactor unrelated code.
- Drop unused variables and imports.
- Prefer meaningful names over comments; comment only non-obvious intent or constraints.
- Every new file must end with a trailing newline.
- Never use deprecated APIs; replace them with the recommended alternative.
- For bug fixes, add the smallest failing test first when practical. Prefer unit/integration tests; E2E only for real multi-layer user flows.

## TypeScript

- Keep `strict` checking **everywhere**, including `*.spec.ts`. Do not use `any` or `as any`.
- Prefer `unknown` + narrowing; when a cast is unavoidable, use `as unknown as Something` (or a typed guard), not `any`.
- Prefer inference when obvious; annotate when it clarifies intent.
- Prefer discriminated unions over boolean flag combinations.
- Prefer `satisfies` over `as` when checking object shapes.
- Prefer `readonly` and immutable updates unless controlled mutation is clearly better.
- Class member order is the four groups in the Angular section below.
- Naming: PascalCase for classes, camelCase for members/variables.
- Injected / constructed dependencies: name the field after the injected symbol, camelCased (e.g. `HttpClient` → `httpClient`, `UsersService` → `usersService`). Do not shorten to `http`, `users`, etc.

## Testing

- Prefer unit/integration tests with Vitest + Angular TestBed; E2E only for real multi-layer user flows.
- Access private/protected members in specs via **index signature** (keeps real types): `component['textRooms']()`, `service['applyAvailableUpdate'] = vi.fn()`. Do **not** introduce helpers that cast the whole instance with `as unknown as { … }` or `as any` just to reach internals.
- Mock collaborators with typed `useValue` objects; keep mock references instead of casting `TestBed.inject(...)` to `any`.

## Angular

- Use `input()` / `output()` (and `input.required()` when needed), not `@Input` / `@Output`.
- Use signals for local state (`signal`, `computed`); update with `set` / `update`, never mutate signal contents in place.
- In `computed()` / `effect()` / `linkedSignal()`, **read every tracked signal first**, then branch or return. An early return (or short-circuit `||` / `&&`) before later signal reads means those deps are never registered on that run.

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

- Always set `changeDetection: ChangeDetectionStrategy.OnPush`.
- Prefer `inject()` over constructor injection.
- Order class members in four groups, and do not mix them:
  1. Every `inject()` call, including `protected` ones.
  2. Other fields, from `public` to `private` (`input()`, `output()`, `signal()`, `computed()`, `viewChild()`, plain fields).
  3. The constructor, when there is one.
  4. Methods, from `public` to `private`.
- Put host bindings in the `host` object of `@Component` / `@Directive` — do not use `@HostBinding` / `@HostListener`.
- Do not use `ngClass` / `ngStyle`; use `[class.foo]` / `[style.prop]`.
- Lazy-load feature routes with `loadComponent` (see `app.routes.ts`).
- Keep components focused; push shared or heavy logic into services or stores.

### Templates

- Prefer `@if`, `@for`, `@switch` (native control flow).
- Keep templates simple. Do not call ordinary methods or functions from templates (bindings, interpolations, `@if` / `@for` / `@switch`, or `host` property bindings). Change detection re-runs them on every cycle. Precompute derived values in `computed()` and read those signals in the template. Event bindings such as `(click)="save()"` are fine.
- When a binding inside `@for` only compares each item to one shared signal (the active tile, the selection, and so on), read that signal once with `@let` before the loop and compare in the binding.

```html
// GOOD EXAMPLE @let focus = focusTile(); @for (tile of tiles(); track tile.key)
{
<button [class.active]="focus?.key === tile.key"></button>
}
```

- Prefer signals in templates; use `async` pipe for Observables when signals are not available.
- Two-way binding with writable signals is fine: `[(open)]="isOpen"`.
- Format dates with `DayjsPipe` (`| dayjs`), not Angular `DatePipe`. Default format is locale-aware (`L LTS`); pass a dayjs format string only when a specific layout is required. Import from `@shared/pipes/dayjs.pipe`.

### Accessibility & performance

- Use semantic HTML and appropriate `aria-*` where the UI needs it.
- Rely on OnPush + signals; avoid unnecessary work in hot paths and large lists.
- Lazy-load routes and keep feature boundaries clear to control bundle size.

## State

- **Local UI state** → component signals.
- **Feature/domain state** → NgRx `signalStore` (see `users.store.ts`, `rooms.store.ts`, `chat.store.ts`, `settings.store.ts`).
- **Cross-cutting app state** → NgRx Store + Effects (`auth`). Do not invent a third pattern for the same concern.
- Derived state goes in `computed()` / `withComputed` — no side effects inside.
- Services own imperative/realtime side effects (sockets, mediasoup, media devices); components and stores consume them.

Expose readonly views of state when external code should not write to it.

## Forms

Prefer reactive forms with Zod schemas from `@konvoez/shared`:

- Field validators: `createZodFieldValidator`
- Form validators: `createZodFormValidator`
- Error messages: `createZodError` (a `computed`, not a template function)

Do not hand-write Angular `Validators.*` when a shared schema already exists.

## UI

- Prefer Taiga UI components (`@taiga-ui/core`, `kit`, `layout`, …) over custom controls when they fit.
- User-facing strings go through ngx-translate (`TranslatePipe` / `TranslateService`), not hard-coded copy in templates.
- Match existing SCSS patterns and mixins under `src/`; do not introduce a new styling approach.

## Services

- One clear responsibility per service.
- Prefer `@Injectable({ providedIn: 'root' })` for app singletons unless a narrower scope is required.
- Keep HTTP/API clients thin (`*-api.service.ts`); orchestration belongs in effects, stores, or domain services.

## Change discipline

- Preserve existing architecture unless there is a strong reason to change it.
- Follow Conventional Commits when committing (`feat(frontend): …`, `fix(frontend): …`).
- After substantive edits, ensure lint/tests relevant to the touched area still pass.

## Resources

- [Angular essentials](https://angular.dev/essentials) — components, signals, templates, DI
- [NgRx docs](https://ngrx.io/docs) — Store, Effects, SignalStore
- [Taiga UI](https://taiga-ui.dev) — via MCP `taiga-ui` when implementing UI
- Shared contracts: `libs/shared` (`@konvoez/shared`)
