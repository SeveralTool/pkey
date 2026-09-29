#!/usr/bin/env node
/**
 * Copy the working tree into a destination folder for the public audit repo.
 * Does not copy .git or pkey-dev history. Destination should be a separate clone
 * of github.com/SeveralTool/pkey (or an empty folder you `git init`).
 *
 * Usage:
 *   npm run sync:public -- C:\\proyects\\pkey-public
 *   node scripts/sync-public-snapshot.mjs ../pkey-public
 */
import { cpSync, existsSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const destArg = process.argv[2];
if (!destArg) {
  console.error('Usage: node scripts/sync-public-snapshot.mjs <destination-dir>');
  process.exit(1);
}

const dest = resolve(destArg);
if (dest === root) {
  console.error('Destination must not be this working tree.');
  process.exit(1);
}

const SKIP_NAMES = new Set([
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

/** @param {string} srcPath */
function shouldSkip(srcPath) {
  const rel = srcPath.slice(root.length + 1).replaceAll('\\', '/');
  const parts = rel.split('/');
  const name = basename(srcPath);
  if (SKIP_NAMES.has(name)) return true;
  if (parts.length === 1 && SKIP_ROOT_DIRS.has(name)) {
    try {
      return statSync(srcPath).isDirectory();
    } catch {
      return false;
    }
  }
  if (
    name.endsWith('.jks') ||
    name.endsWith('.p8') ||
    name.endsWith('.p12') ||
    name.endsWith('.key')
  ) {
    return true;
  }
  if (name === 'test_output.txt' || name === 'test_full_output.txt' || name === 'tsc_output.txt') {
    return true;
  }
  if (
    rel.startsWith('modules/') &&
    (rel.includes('/android/build') || rel.includes('/android/.gradle'))
  ) {
    return true;
  }
  return false;
}

if (!existsSync(dest)) mkdirSync(dest, { recursive: true });

const destGit = join(dest, '.git');
const keepGit = existsSync(destGit);

cpSync(root, dest, {
  recursive: true,
  filter: (src) => {
    if (src === root) return true;
    if (shouldSkip(src)) return false;
    return true;
  },
});

if (!keepGit && existsSync(destGit)) {
  rmSync(destGit, { recursive: true, force: true });
}

console.log(`Public snapshot copied to ${dest}`);
console.log(
  'Excluded: .git history, archive/, node_modules, generated android/ios, keystores, .env'
);
console.log('Next: cd into destination, commit, npm run stamp:integrity, then EAS from that HEAD.');
