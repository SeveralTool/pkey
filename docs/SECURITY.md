# Security Policy

## Supported versions

| Version | Supported |
|---------|-----------|
| 1.x     | Yes       |
| < 1.0   | No        |

## Reporting a vulnerability

PKEY handles master passwords, vault ciphertext, sync/migration protocols, and TLS on the local network. **Do not file public GitHub issues for security vulnerabilities.**

The source code is published for **audit and transparency** (see [LICENSE](../LICENSE)). Security researchers may review the code to verify behavior; please report findings responsibly rather than exploiting them.

Please report responsibly via **[GitHub Security Advisories](https://github.com/SeveralTool/pkey/security/advisories/new)** (private) with:

- Description of the issue and impact
- Affected component (mobile, `@pkey/core`, web-client, migration, sync, native module)
- Steps to reproduce / proof of concept (non-destructive preferred)
- Your suggested fix, if any

We aim to acknowledge reports within **7 days** and provide a status update within **14 days**.

## Scope (examples)

In scope:

- Cryptographic design or implementation flaws
- Authentication / session handling bugs that expose vault secrets
- Path traversal, XSS, or injection in the embedded PWA or import pipeline
- Insecure defaults in sync / migration protocols

Out of scope:

- Loss of a master password (by design, recovery is impossible)
- Physical access to an unlocked device
- Social engineering of users
- Vulnerabilities only in third-party dependencies already fixed upstream (please note the version)

## Safe harbor

We will not pursue legal action against researchers who:

- Make a good-faith effort to avoid privacy violations and data destruction
- Do not exploit the issue beyond what is needed to demonstrate it
- Report findings privately and give us reasonable time to fix before disclosure

## Transparency and privacy

- **Local-first:** Vault ciphertext stays on the user’s devices. There is no vendor cloud sync of secrets.
- **Audit source:** The GitHub repository is published so independent reviewers can inspect crypto, sync, migration, and storage behavior.
- **Privacy policy (app distribution):** Draft user-facing policy lives in [legal/PRIVACY_POLICY.md](./legal/PRIVACY_POLICY.md) (attorney review required before store publication).
- **Build integrity:** Publish and verify **SHA-256** digests of distributed APK/AAB artifacts as described in [DEPLOYMENT.md](./DEPLOYMENT.md#sha-256-verification-transparency).

## Hardening and validation notes

| Document | Topic |
|----------|-------|
| [THREAT_MODEL.md](./THREAT_MODEL.md) | Short threat model (LAN web, migration, assets) |
| [SECURITY_HARDENING_VALIDATION.md](./SECURITY_HARDENING_VALIDATION.md) | Hardening checklist |
| [MIGRATION_TLS_VALIDATION.md](./MIGRATION_TLS_VALIDATION.md) | Migration TLS |
| [WEB_MDNS_VALIDATION.md](./WEB_MDNS_VALIDATION.md) | Web / mDNS |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Encryption and data flow |
| [archive/SESSION_SECURITY_EXPLANATION.md](../archive/SESSION_SECURITY_EXPLANATION.md) | Historical session notes |
