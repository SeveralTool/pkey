# Legal documents

User-facing privacy, terms, official-app, and third-party notices. In-app copies live in `src/constants/legalContent.ts`. Public HTTPS copies (Play Store) are generated into `legal-site/` (`npm run legal:site`) and served at https://severaltool.github.io/pkey/ .

| Document | Audience | Purpose |
|----------|----------|---------|
| [PRIVACY_POLICY.md](./PRIVACY_POLICY.md) | App users | Required by Apple App Store and Google Play |
| [TERMS_OF_SERVICE.md](./TERMS_OF_SERVICE.md) | App users | EULA / terms of use for the mobile app |
| [OFFICIAL_APP.md](./OFFICIAL_APP.md) | Public | Official app and canonical source |
| [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md) | App users / auditors | Open-source dependency attributions |
| [PLAY_CONSOLE.md](./PLAY_CONSOLE.md) | Maintainers | Google Play Data safety, IARC, permissions (copy into Console) |

## Source code vs. app distribution

| Channel | Governing document |
|---------|-------------------|
| GitHub repository | [LICENSE](../../LICENSE) (audit-only / source-available) |
| App Store / Play Store | [TERMS_OF_SERVICE.md](./TERMS_OF_SERVICE.md) + [PRIVACY_POLICY.md](./PRIVACY_POLICY.md) |

External code contributions are **not accepted**. See [LICENSE](../../LICENSE) §3 and [../CONTRIBUTING.md](../CONTRIBUTING.md). An obsolete CLA draft is kept under [`../../archive/CLA.md`](../../archive/CLA.md) for history only.

## Before store submission

Do **not** track Play Console / AAB / screenshots here. The living launch checklist is [../DEPLOY_CHECKLIST.md](../DEPLOY_CHECKLIST.md). This list is only the legal-document subset:

- [x] User-facing privacy, terms, and official-app texts omit dates and names (people / companies / entities). OSS notices and [LICENSE](../../LICENSE) keep required copyright lines
- [x] Governing law omitted on purpose (product policy)
- [x] In-app **Legal** screen (Settings → Legal) plus first-use checkbox on create session (privacy + terms only; no age declaration and no date of birth)
- [x] Host Privacy Policy and Terms at https://severaltool.github.io/pkey/ (GitHub Pages; `LEGAL_WEB_URLS`)
- [ ] Add Privacy Policy URL to Google Play Console (and App Store Connect later)
- [ ] Complete Google Play Data safety form — answers: [PLAY_CONSOLE.md](./PLAY_CONSOLE.md)
- [x] Regenerated [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md) companion list via `npm run legal:notices` (`THIRD_PARTY_NOTICES.generated.md`)
- [x] **N/A** — External counsel is not part of this launch

## Age and children

Play Console target audience stays **18+** so the app is not in Designed for Families. Do **not** enable Restrict Minor Access. Privacy uses the COPPA threshold (not directed at people under 13). Terms require legal capacity to contract, not a numeric 18+ floor: Apple App Store Connect requires an age-rating override if the EULA sets a minimum age above the questionnaire result.

Official repository: https://github.com/SeveralTool/pkey
