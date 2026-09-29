/**
 * Paths excluded from the public audit snapshot (SeveralTool/pkey).
 * Runtime source, tests, and auditor-facing docs stay; maintainer playbooks,
 * brand archives, and store/lab notes stay in pkey-dev only.
 */

const SKIP_BASENAMES = new Set([
  '.git',
  'node_modules',
  '.expo',
  'builds',
  'coverage',
  'test-results',
  'playwright-report',
  'dist',
  'web-build',
  '.cursor',
  '.idea',
  'archive',
  '.DS_Store',
  '.env',
]);

const SKIP_ROOT_DIRS = new Set(['android', 'ios']);

const SKIP_EXACT = new Set([
  'AGENTS.md',
  'docs/DEPLOYMENT.md',
  'docs/DEPLOY_CHECKLIST.md',
  'docs/SECURITY_REMEDIATION.md',
  'docs/SECURITY_HARDENING_VALIDATION.md',
  'docs/MIGRATION_TLS_VALIDATION.md',
  'docs/WEB_MDNS_VALIDATION.md',
  'docs/legal/PLAY_CONSOLE.md',
  'scripts/bootstrap-public-github.mjs',
]);

const SKIP_PREFIXES = ['docs/dev_procedure', 'docs/store', 'docs/evidence', 'assets/logo'];

const SKIP_DUMP_NAMES = new Set(['test_output.txt', 'test_full_output.txt', 'tsc_output.txt']);

/**
 * @param {string} rel posix path relative to the repo root
 * @returns {boolean}
 */
export function shouldSkipPublicPath(rel) {
  const posix = rel.replaceAll('\\', '/');
  if (!posix) return false;
  const parts = posix.split('/').filter(Boolean);
  const name = parts[parts.length - 1];
  if (parts.some((part) => SKIP_BASENAMES.has(part))) return true;
  if (parts.length === 1 && SKIP_ROOT_DIRS.has(name)) return true;
  if (SKIP_EXACT.has(posix)) return true;
  for (const prefix of SKIP_PREFIXES) {
    if (posix === prefix || posix.startsWith(`${prefix}/`)) return true;
  }
  if (
    name.endsWith('.jks') ||
    name.endsWith('.p8') ||
    name.endsWith('.p12') ||
    name.endsWith('.key')
  ) {
    return true;
  }
  if (SKIP_DUMP_NAMES.has(name)) return true;
  if (
    posix.startsWith('modules/') &&
    (posix.includes('/android/build') || posix.includes('/android/.gradle'))
  ) {
    return true;
  }
  return false;
}

export const PUBLIC_SNAPSHOT_EXCLUSIONS = {
  SKIP_EXACT: [...SKIP_EXACT],
  SKIP_PREFIXES: [...SKIP_PREFIXES],
};
