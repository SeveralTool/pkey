#!/usr/bin/env node
/**
 * One-time GitHub split: SeveralTool/pkey-dev (private, existing history) +
 * SeveralTool/pkey (public, orphan snapshot). Requires `gh auth login`.
 *
 *   npm run bootstrap:public-github
 */
import { execFileSync, execSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

function gh(args, opts = {}) {
  return execFileSync('gh', args, { cwd: root, encoding: 'utf8', ...opts }).trim();
}

function gitHere(args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
}

function gitDest(dest, args, opts = {}) {
  return execFileSync('git', args, { cwd: dest, encoding: 'utf8', ...opts }).trim();
}

function tryGh(args) {
  try {
    return gh(args);
  } catch {
    return null;
  }
}

try {
  gh(['auth', 'status']);
} catch {
  console.error('Not logged in. Run: gh auth login --web --git-protocol ssh --skip-ssh-key');
  process.exit(1);
}

const current = JSON.parse(gh(['repo', 'view', '--json', 'name,owner']));
const owner = current.owner.login;
if (owner !== 'SeveralTool') {
  console.error(`Logged into ${owner}, expected SeveralTool.`);
  process.exit(1);
}

if (current.name === 'pkey') {
  console.log('Renaming SeveralTool/pkey → SeveralTool/pkey-dev…');
  gh(['repo', 'rename', 'pkey-dev', '--yes']);
} else if (current.name !== 'pkey-dev') {
  console.error(`Unexpected repo ${owner}/${current.name}.`);
  process.exit(1);
}

if (!tryGh(['repo', 'view', 'SeveralTool/pkey', '--json', 'name'])) {
  console.log('Creating public SeveralTool/pkey…');
  gh([
    'repo',
    'create',
    'SeveralTool/pkey',
    '--public',
    '--disable-wiki',
    '--description',
    'PKEY — source-available local-first password manager (audit only)',
  ]);
}

tryGh(['api', '-X', 'PATCH', 'repos/SeveralTool/pkey', '-f', 'has_wiki=false']);
tryGh(['api', '-X', 'PUT', 'repos/SeveralTool/pkey/vulnerability-alerts']);
tryGh(['api', '-X', 'PUT', 'repos/SeveralTool/pkey/private-vulnerability-reporting']);

function ensureRemote(name, url) {
  const remotes = gitHere(['remote']).split(/\r?\n/).filter(Boolean);
  if (remotes.includes(name)) {
    gitHere(['remote', 'set-url', name, url]);
  } else {
    gitHere(['remote', 'add', name, url]);
  }
}

const remotes = gitHere(['remote']).split(/\r?\n/).filter(Boolean);
if (remotes.includes('origin') && !remotes.includes('pkey-dev')) {
  gitHere(['remote', 'rename', 'origin', 'pkey-dev']);
}
ensureRemote('pkey-dev', 'git@github.com:SeveralTool/pkey-dev.git');
ensureRemote('public', 'git@github.com:SeveralTool/pkey.git');

const dest = mkdtempSync(join(tmpdir(), 'pkey-public-'));
console.log(`Building orphan snapshot in ${dest}`);
execFileSync(process.execPath, [join(root, 'scripts/sync-public-snapshot.mjs'), dest], {
  cwd: root,
  stdio: 'inherit',
});

gitDest(dest, ['init', '-b', 'main']);
gitDest(dest, ['add', '-A']);
gitDest(dest, ['commit', '-m', 'chore: initial public audit snapshot']);
gitDest(dest, ['remote', 'add', 'origin', 'git@github.com:SeveralTool/pkey.git']);
gitDest(dest, ['push', '-u', 'origin', 'main'], { stdio: 'inherit' });
rmSync(dest, { recursive: true, force: true });

try {
  execSync('gh api -X POST repos/SeveralTool/pkey/pages --input -', {
    cwd: root,
    encoding: 'utf8',
    input: JSON.stringify({ build_type: 'workflow', source: { branch: 'main', path: '/' } }),
    stdio: ['pipe', 'pipe', 'pipe'],
  });
} catch {
  console.warn('Enable GitHub Pages: repo Settings → Pages → GitHub Actions.');
}

console.log('Public: https://github.com/SeveralTool/pkey');
console.log('Private history: https://github.com/SeveralTool/pkey-dev');
console.log('Legal pages: enable Pages (GitHub Actions) if the API call was skipped.');
console.log('This clone remotes: pkey-dev (push WIP), public (snapshots).');
