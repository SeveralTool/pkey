import assert from 'node:assert/strict';
import { test } from 'node:test';
import { shouldSkipPublicPath } from './public-snapshot-filter.mjs';

test('keeps runtime source, tests, and auditor docs', () => {
  for (const rel of [
    'src/App.tsx',
    'packages/core/src/crypto/nativeKat.ts',
    'modules/pkey-crypto/ios/Argon2Bridge.m',
    'assets/images/icon.png',
    'assets/images/brand-logo.png',
    'assets/fonts/SpaceMono-Regular.ttf',
    'docs/ARCHITECTURE.md',
    'docs/GETTING_STARTED.md',
    'docs/legal/PRIVACY_POLICY.md',
    'docs/templates/procedures/master_password.en.md',
    'scripts/sync-public-snapshot.mjs',
    'README.md',
    'LICENSE',
  ]) {
    assert.equal(shouldSkipPublicPath(rel), false, rel);
  }
});

test('skips maintainer playbooks, brand archive, and lab notes', () => {
  for (const rel of [
    'AGENTS.md',
    'docs/dev_procedure',
    'docs/dev_procedure/BUGS.md',
    'docs/dev_procedure/SYNC_PUBLIC.md',
    'docs/DEPLOYMENT.md',
    'docs/DEPLOY_CHECKLIST.md',
    'docs/store/PLAY_LISTING.md',
    'docs/legal/PLAY_CONSOLE.md',
    'docs/evidence/ANDROID_MANIFEST_SNAPSHOT.md',
    'docs/SECURITY_REMEDIATION.md',
    'docs/SECURITY_HARDENING_VALIDATION.md',
    'docs/MIGRATION_TLS_VALIDATION.md',
    'docs/WEB_MDNS_VALIDATION.md',
    'assets/logo/v6/v6.png',
    'assets/logo/PKEY.png',
    'scripts/bootstrap-public-github.mjs',
    'archive/README.md',
    '.env',
    'android',
    'ios',
  ]) {
    assert.equal(shouldSkipPublicPath(rel), true, rel);
  }
});
