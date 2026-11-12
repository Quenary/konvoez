Review the current changes (git diff). Do not modify any code or files (strict read-only). I will review your findings and tell you which fixes to apply.

### Context & Ground Rules

Before inspecting the diff, read and align with `@AGENTS.md`, `@docs/CONTRIBUTING.md`, and the documentation for the affected app/module. Judge the changes strictly against this project's established architecture and rules, not generic preferences.

### What to look for (scoped to the changes and their direct blast radius)

1. **Bugs & Edge Cases**: flawed business logic, unhandled errors/exceptions, unsafe `null`/`undefined`/empty state handling, boundary conditions, and broken error recovery.
2. **Concurrency & Resource Leaks**: race conditions, floating/unhandled promises, memory or resource leaks (uncleaned subscriptions, event listeners, timers, streams, connections, or missing teardown/destroy lifecycle hooks).
3. **Broken Contracts (Blast Radius)**: breaking changes to callers, mismatched types/DTOs/schemas across boundaries, or unintended side effects in dependent modules (verify call sites of modified functions/classes).
4. **Guideline Violations & Code Smells**: violations of architectural boundaries, patterns, or conventions defined in `@AGENTS.md` and `@docs/CONTRIBUTING.md`, as well as obvious code smells that hurt maintainability.
5. **Docs & Test Drift**: documentation in `@AGENTS.md` or `/docs` that became outdated due to these changes, or missing/broken tests for critical new behavior.

### Severity Threshold

Report ONLY `high` and `medium` issues. Strictly omit `low`, `nitpicks`, formatting, or subjective style preferences:

- **`high`**: defects causing crashes, data corruption, race conditions, memory/resource leaks, broken API/type contracts, or direct violations of core architectural rules in `@AGENTS.md`.
- **`medium`**: unhandled edge cases, performance regressions, project convention violations, obvious code smells, or documentation drift caused by the diff.

### How to respond

- Write **only about confirmed problems**. Do not summarize the diff, do not list clean areas, and do not invent remarks to fill space.
- Do not flag pre-existing legacy code unless the current changes directly interact with or worsen it.
- If there are no `high` or `medium` problems, state so in a single sentence ("No high or medium issues found.") and stop.
- Format for each finding (ordered from `high` to `medium`):

**[ID, e.g., REV-01] Short Descriptive Title**

- **Severity**: `high` | `medium`
- **Location**: `path/to/file.ext:lines` (plus function/method/class name)
- **Why it is a problem**: concrete failure scenario, edge case, or specific guideline violated.
- **Proposed fix**: brief, actionable solution (in text or a minimal snippet, without modifying files).
