# Supply chain (SBOM / SLSA)

## SBOM

CI job `sbom` produces a CycloneDX JSON (`sbom.cdx.json`) via `@cyclonedx/cyclonedx-npm`. Locally: `npm run sbom`. Attach the file to GitHub Releases next to the AAB.

## Vulnerability gate

`audit-ci --moderate` already runs on every PR (`dependency-audit` job). High/critical in production deps fail CI.

## Release hashes

Publish SHA-256 of each APK/AAB on the GitHub Release. Signing with Sigstore/cosign is recommended for SLSA 2; not automated here because EAS-hosted builds are not bit-for-bit reproducible.

## Crypto dependency pins

Manual review required before bumping:

- `crypto-es`
- `@noble/hashes`
- `@noble/ciphers`
- `@noble/curves`
- `react-native-quick-crypto`
- `hash-wasm` (PWA)

## Reproducible builds

EAS does not guarantee bit-for-bit identical binaries. The documented local path is `npm ci` + Gradle from a stamped commit (`stamp:integrity`). Full reproducibility is a non-goal while EAS remains the store pipeline.
