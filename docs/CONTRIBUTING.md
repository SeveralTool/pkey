# Project policy

**External code contributions are not accepted.**

PKEY is maintained solely by **SeveralTool**. This repository is **source-available** for transparency and security audit — it is **not** an open-source contribution project (OSI). See [LICENSE](../LICENSE).

## What this repository is for

- **Read and review** the source to verify there is no malicious code, spyware, or backdoors.
- **Build and run** locally in a private environment **only** for that security audit.
- Obtain the **official app** from SeveralTool through authorized channels (e.g. Apple App Store, Google Play).

You may **not** use this source as your own product, redistribute modified copies, or publish store listings derived from it, unless SeveralTool gives prior written permission.

## Security reports

Do **not** open public GitHub issues for vulnerabilities. Report privately via [SECURITY.md](./SECURITY.md).

Responsible disclosure does **not** grant any right to modify, redistribute, or claim authorship of the software, and does not imply that patches will be accepted from third parties.

## Building for audit

If you clone the repo to audit it:

1. Follow [GETTING_STARTED.md](./GETTING_STARTED.md) for audit-only clone, tests, and local run.
2. Read [ARCHITECTURE.md](./ARCHITECTURE.md) for monorepo layout, data flow, and encryption.

Do **not** commit secrets, `.env` files, signing keys, or vault backups to any fork or mirror you create for private review.

## Public vs private GitHub (maintainers)

Day-to-day work lives in the private **`SeveralTool/pkey-dev`** history. The canonical audit repo is **`SeveralTool/pkey`** (filtered snapshots, no WIP commits). URLs in the app stay `https://github.com/SeveralTool/pkey`. Store, EAS, and snapshot recipes stay in the private tree.

## Pull requests and issues

- **Pull requests are not accepted** and will be closed without merge.
- Opening an issue (bug report or feature idea) does **not** create an obligation to implement changes, and is **not** a contribution workflow.
- Public interaction is expected to follow the [Code of Conduct](./CODE_OF_CONDUCT.md).

## License

Full terms: [LICENSE](../LICENSE). Legal templates for store distribution: [legal/README.md](./legal/README.md).
