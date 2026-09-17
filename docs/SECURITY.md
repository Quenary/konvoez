# Security policy

Konvoez is a **self-hosted, single-server** voice and text chat platform (similar to Discord, but where the deployed instance represents the single server itself). It is designed to be hosted by private communities, teams, or individuals on self-managed infrastructure. Please read this page before opening a security advisory.

## Threat model

- **Single-instance server model**: The deployed application instance acts as its own self-contained server. It hosts text and voice rooms for authenticated users. It is not designed as a multi-tenant public cloud SaaS with tenant isolation.
- **User roles and authorization**:
  - `OWNER`: The instance creator / primary operator. Assigned exclusively to the first registered user via a one-time cryptographic bootstrap setup token printed to server logs. Possesses full administrative rights across the entire server (user management, room management, server settings, invite management). Cannot be transferred, escalated, or assigned via standard user management APIs.
  - `ADMIN`: Elevated administrator role. Can manage rooms, moderate chat messages, manage user accounts, manage server settings, and issue/revoke invite links.
  - `USER` (referred to as `MEMBER` in the codebase): Standard authenticated user. Can join text and voice rooms, send messages, participate in voice channels, edit/delete their own messages, and update their own profile and avatar.
- **Instance bootstrap & initial OWNER registration**:
  - On a fresh installation (when zero users exist in the database), the server generates a single-use 16-byte cryptographically secure random token (`owner_setup_token`) with a 5-minute TTL and prints it to the server console/stdout log.
  - The initial registration request must supply this valid `setupToken` to create the `OWNER` account.
  - Once used, the token is permanently consumed. If the token expires before use, the instance must be restarted to issue a new one.
  - This prevents front-running and unauthorized instance takeover when deploying new instances to public networks.
- **Registration policy & invite-only signups**:
  - User registration is governed by the `INVITE_ONLY_SIGN_UP` setting (defaults to `true`).
  - The setting can be predefined via the `INVITE_ONLY_SIGN_UP` environment variable or dynamically toggled by `OWNER` / `ADMIN` in the admin settings UI.
  - When `INVITE_ONLY_SIGN_UP` is enabled, new user registration strictly requires a valid, active invite code.
  - Invites can only be created by `OWNER` or `ADMIN`, have configurable expiration times (TTL), are single-use, and can optionally be bound to a specific recipient email address.
  - Expired, revoked, or already consumed invite codes cannot be used for registration.
  - Initial `OWNER` registration is exempt from invite codes, but is protected by the bootstrap setup token.
- **Message encryption at rest**:
  - Text messages are encrypted server-side before being written to the database using AES-256-GCM.
  - Encryption keys are derived using HKDF-SHA256 from the server's `MASTER_KEY` secret.
  - Each message has a unique Initialization Vector (IV) and authentication tag.
  - This protects database backups and disk dumps from exposure if the raw database file is accessed without the server's environment secrets.
- **Voice communication**:
  - Voice rooms utilize WebRTC with a Selective Forwarding Unit (Mediasoup SFU).
  - Media streams in transit are encrypted via standard WebRTC DTLS-SRTP protocols.
- **Authentication**:
  - Session tokens are JWTs delivered via secure HTTP cookies.
  - User passwords are secure hashes stored using Argon2 / bcrypt.

Reports are judged against this model rather than against a multi-tenant cloud SaaS.

## In scope

- Unauthenticated access to private rooms, message streams, or user details.
- Authentication or authorization bypass (e.g., impersonating another user, forging JWT cookies).
- Bypassing the initial `OWNER` bootstrap token requirement (e.g., claiming `OWNER` without a valid token or after initial setup).
- Bypassing the invite-only registration policy when `INVITE_ONLY_SIGN_UP` is active (e.g., registering without a code, reusing consumed/revoked/expired invites, or bypassing email binding on restricted invites).
- Unauthorized creation, revocation, or enumeration of invite codes by unauthenticated users or standard `USER` (`MEMBER`) accounts.
- Privilege escalation (e.g., a standard `USER` escalating to `ADMIN` or assigning `OWNER`).
- Cross-user data manipulation (e.g., modifying or deleting messages belonging to other users without admin privileges).
- Cryptographic flaws in message encryption or key derivation (e.g., IV reuse, ciphertext manipulation bypassing GCM authentication tags).
- Path traversal, arbitrary file read/write in file/avatar upload and streaming endpoints (local or S3 storage).
- Remote Code Execution (RCE) or SQL injection vulnerabilities in database queries.
- Application-level Denial of Service (DoS) through resource exhaustion or asymmetric workloads (e.g., image bombs/pixel flooding, memory leaks triggered by malformed payloads).

## Out of scope

These are not treated as vulnerabilities (and will not be accepted as High/Critical):

- Scenarios requiring an attacker to already possess physical or root/shell access to the host server or Docker container.
- Intercepting the one-time `OWNER` setup token through access to the server console, stdout, or container log files (host/container access is already considered a fully compromised environment).
- Access to data made possible by obtaining the host environment variables (`MASTER_KEY`, `JWT_SECRET`, database credentials).
- Actions intentionally permitted for `OWNER` or `ADMIN` roles (e.g., an admin deleting a room, kicking/deleting a user account, generating invites, or changing server settings).
- Attacks exploiting lack of TLS termination when the host operator fails to configure a reverse proxy (operators are expected to deploy behind HTTPS/TLS in production).
- Weak operator-configured environment secrets (e.g., using a trivial `MASTER_KEY` or `JWT_SECRET`).
- Denial of Service (DoS) resulting from network saturation or standard media bandwidth limits without an underlying software vulnerability.

## Severity

CVSS is scored strictly in the context of this self-hosted threat model:

- **Critical / High**: Unauthenticated remote access, authentication bypass, bypassing the initial `OWNER` setup token, registration bypass under invite-only mode, remote code execution, unauthorized decryption of messages without the key, or privilege escalation from regular `USER` to `ADMIN`/`OWNER`.
- **Medium / Low**: Minor permission anomalies within the same privilege level, or issues requiring already-compromised administrative credentials.

## Reporting

Please report vulnerabilities privately via **GitHub Security Advisories** on the repository, rather than creating public GitHub issues.

Include detailed reproduction steps, the assumed threat level (authenticated vs unauthenticated, user role), and a proof-of-concept demonstrating the impact beyond intended user capabilities.
