# Legal documents

User-facing privacy, terms, official-app, and third-party notices. In-app copies live in `src/constants/legalContent.ts`. Public HTTPS copies (Play Store) are generated into `legal-site/` (`npm run legal:site`) and served at https://severaltool.github.io/pkey/ .

| Document | Audience | Purpose |
|----------|----------|---------|
| [PRIVACY_POLICY.md](./PRIVACY_POLICY.md) | App users | Required by Apple App Store and Google Play |
| [TERMS_OF_SERVICE.md](./TERMS_OF_SERVICE.md) | App users | EULA / terms of use for the mobile app |
| [OFFICIAL_APP.md](./OFFICIAL_APP.md) | Public | Official app and canonical source |
| [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md) | App users / auditors | Open-source dependency attributions |

## Source code vs. app distribution

| Channel | Governing document |
|---------|-------------------|
| GitHub repository | [LICENSE](../../LICENSE) (audit-only / source-available) |
| App Store / Play Store | [TERMS_OF_SERVICE.md](./TERMS_OF_SERVICE.md) + [PRIVACY_POLICY.md](./PRIVACY_POLICY.md) |

External code contributions are **not accepted**. See [LICENSE](../../LICENSE) §3 and [../CONTRIBUTING.md](../CONTRIBUTING.md).

User-facing privacy, terms, and official-app texts omit dates and names (people / companies / entities). OSS notices and [LICENSE](../../LICENSE) keep required copyright lines. Hosted copies: https://severaltool.github.io/pkey/ (`LEGAL_WEB_URLS`). Play Console questionnaires and the launch tracker stay in the private development repository.

## Age and children

Play Console target audience stays **18+** so the app is not in Designed for Families. Do **not** enable Restrict Minor Access. Privacy uses the COPPA threshold (not directed at people under 13). Terms require legal capacity to contract, not a numeric 18+ floor: Apple App Store Connect requires an age-rating override if the EULA sets a minimum age above the questionnaire result.

Official repository: https://github.com/SeveralTool/pkey
