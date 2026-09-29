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
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { shouldSkipPublicPath } from './public-snapshot-filter.mjs';

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

/** @param {string} srcPath */
function shouldSkip(srcPath) {
  const rel = relative(root, srcPath).replaceAll('\\', '/');
  return shouldSkipPublicPath(rel);
}

/**
 * Drop previously published files that the filter now excludes.
 * Keep `.git` and `node_modules` so the public clone can stamp without a full reinstall.
 * @param {string} destDir
 */
function clearDestKeepGitAndNodeModules(destDir) {
  if (!existsSync(destDir)) return;
  for (const name of readdirSync(destDir)) {
    if (name === '.git' || name === 'node_modules') continue;
    rmSync(join(destDir, name), { recursive: true, force: true });
  }
}

if (!existsSync(dest)) mkdirSync(dest, { recursive: true });

const destGit = join(dest, '.git');
const keepGit = existsSync(destGit);

clearDestKeepGitAndNodeModules(dest);

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
  'Excluded: maintainer docs, brand archive, store/lab notes, AGENTS.md, .git history, archive/, node_modules, generated android/ios, keystores, .env'
);
console.log('Next: cd into destination, commit, npm run stamp:integrity, then EAS from that HEAD.');
