# Contributing guidelines for the Konvoez project

Contributions are welcome. Please follow these guidelines to keep the project consistent and maintainable.

## Architecture & Development

Konvoez is an Nx monorepo:

- **Frontend** (`apps/frontend`): Built with modern Angular (v19+, Signals, Standalone components, SCSS, Taiga UI).
- **Backend** (`apps/backend`): Built with NestJS, MikroORM, Mediasoup (WebRTC SFU), Socket.IO, and AES-256-GCM message encryption.
- **Shared Library** (`libs/shared`): Shared TypeScript interfaces, enums, DTOs, and Zod validation schemas.

### Getting Started

1. **Prerequisites**: Node.js `^22.22.3` and npm `>=10.9`.
2. **Install dependencies**:
   ```bash
   npm install
   ```
3. **Environment setup**:
   Copy `.env.example` to `.env` and configure required variables:
   ```bash
   cp .env.example .env
   ```
   Make sure `MASTER_KEY`, `JWT_SECRET`, and `MEDIASOUP_ANNOUNCED_IP` are defined.
4. **Run development servers**:
   ```bash
   npm run start:dev
   ```
   Or run individual projects:
   ```bash
   npx nx serve backend
   npx nx serve frontend
   ```
5. **Build**:
   ```bash
   npm run build
   ```

## Commits

- Use the [Conventional Commits](https://www.conventionalcommits.org/) format for all commit messages.
  Example: `feat(backend): add message encryption` or `fix(frontend): update peer audio level indicator`.
  Common types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`.
- Keep commits focused; avoid mixing unrelated changes.
- Husky and lint-staged are configured to run linters and formatters on staged files before commit.

## Code Changes

- Follow the existing code style and architectural patterns in the codebase.
- Prefer clear, readable, and idiomatic solutions over unnecessary cleverness.
- Maintain strict typing: use shared types and Zod schemas from `@konvoez/shared`.
- Avoid introducing heavy or unnecessary dependencies.
- Ensure code is formatted with Prettier (`npm run fmt`) and complies with ESLint rules (`npm run lint`).

## Tests

- All new features and bug fixes should include corresponding automated tests.
- If you modify existing functionality, update or extend the related tests.
- Ensure all tests pass before submitting changes:
  ```bash
  npm run test
  ```
- Ensure lint checks pass:
  ```bash
  npm run lint
  ```

## Pull Requests

- Provide a clear description of what was changed and the reasoning behind it.
- Reference related issues where applicable (e.g., `Closes #123`).
- Keep pull requests focused on a single responsibility.

## General

- For significant features or breaking architectural changes, consider opening an issue or discussing the plan first.
- Update documentation and `README.md` when behavior or configuration options change.
