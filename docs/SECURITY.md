# Security policy

Konvoez is a **self-hosted, single-server** voice and text chat platform (similar to Discord, but where the deployed instance represents the single server itself). It is designed to be hosted by private communities, teams, or individuals on self-managed infrastructure. Please read this page before opening a security advisory.

## Threat model

- **Single-instance server model**: The deployed application instance acts as its own self-contained server. It hosts text and voice rooms for authenticated users. It is not designed as a multi-tenant public cloud SaaS with tenant isolation.
- **User roles and authorization**:
  - `OWNER`: The instance creator / primary operator. Automatically assigned to the first registered user. Possesses full administrative rights across the entire server (user management, room management, server settings). Cannot be transferred or assigned via the user update API.
  - `ADMIN`: Elevated administrator role. Can manage rooms, moderate chat messages, and manage user accounts.
  - `USER` (referred to as `MEMBER` in the codebase): Standard authenticated user. Can join text and voice rooms, send messages, participate in voice channels, edit/delete their own messages, and update their own profile and avatar.
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
- Privilege escalation (e.g., a standard `USER` escalating to `ADMIN` or assigning `OWNER`).
- Cross-user data manipulation (e.g., modifying or deleting messages belonging to other users without admin privileges).
- Cryptographic flaws in message encryption or key derivation (e.g., IV reuse, ciphertext manipulation bypassing GCM authentication tags).
- Path traversal, arbitrary file read/write in file/avatar upload and streaming endpoints (local or S3 storage).
- Remote Code Execution (RCE) or SQL injection vulnerabilities in database queries.

## Out of scope

These are not treated as vulnerabilities (and will not be accepted as High/Critical):

- Scenarios requiring an attacker to already possess physical or root/shell access to the host server or Docker container.
- Access to data made possible by obtaining the host environment variables (`MASTER_KEY`, `JWT_SECRET`, database credentials).
- Actions intentionally permitted for `OWNER` or `ADMIN` roles (e.g., an admin deleting a room or kicking/deleting a user account).
- Attacks exploiting lack of TLS termination when the host operator fails to configure a reverse proxy (operators are expected to deploy behind HTTPS/TLS in production).
- Weak operator-configured environment secrets (e.g., using a trivial `MASTER_KEY` or `JWT_SECRET`).
- Denial of Service (DoS) resulting from network saturation or standard media bandwidth limits without an underlying software vulnerability.

## Severity

CVSS is scored strictly in the context of this self-hosted threat model:

- **Critical / High**: Unauthenticated remote access, authentication bypass, remote code execution, unauthorized decryption of messages without the key, or privilege escalation from regular `USER` to `ADMIN`/`OWNER`.
- **Medium / Low**: Minor permission anomalies within the same privilege level, or issues requiring already-compromised administrative credentials.

## Reporting

Please report vulnerabilities privately via **GitHub Security Advisories** on the repository, rather than creating public GitHub issues.

Include detailed reproduction steps, the assumed threat level (authenticated vs unauthenticated, user role), and a proof-of-concept demonstrating the impact beyond intended user capabilities.
