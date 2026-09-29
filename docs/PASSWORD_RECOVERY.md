# Password recovery

Konvoez can email a one-time code so users can reset a forgotten password. SMTP is configured only via environment variables (not stored in the database).

## Flow

1. **Request** — `POST /api/v1/auth/password-recovery/request` with `{ email }`.
2. Server looks up the user by email. Unknown emails still receive `{ ok: true }` (no account enumeration).
3. If SMTP is configured and the user exists, a **6-digit** code is generated, stored as an Argon2id hash in `password_recovery_codes`, and emailed.
4. Previous unused codes for that user are invalidated.
5. **Confirm** — `POST /api/v1/auth/password-recovery/confirm` with `{ email, code, password }`.
6. On a valid, non-expired, unused code the password is updated and the code is marked used.

## TTL

Code lifetime comes from the `PASSWORD_RECOVERY_CODE_TTL` setting (milliseconds):

- Default: `600000` (10 minutes)
- Allowed range: `60000`–`3600000` (1 minute–1 hour)
- Editable by `OWNER` / `ADMIN` in Administration settings (or via env on startup)

## SMTP

See `.env.example` for `SMTP_HOST`, `SMTP_ENCRYPTION` (`TLS` | `STARTTLS` | other/empty), `SMTP_PORT`, credentials, and `SMTP_FROM`. If `SMTP_HOST` is empty, recovery requests return `503`.

## Protections

- Codes are hashed at rest; plaintext exists only in the outbound email.
- ~60s cooldown per email for request (cache).
- Single-use codes with expiry.
- Generic success on request regardless of whether the email is registered.
