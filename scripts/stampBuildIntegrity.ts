#!/usr/bin/env node
/**
 * Stamps the current git commit + build timestamp into `app.json` under
 * `expo.extra.buildIntegrity`. Run once before every production build (EAS
 * or local) so the shipped binary embeds the exact source revision it was
 * compiled from.
 *
 * The values are surfaced in the app's Settings → Build Integrity panel
 * (audit findings A7 + B3) so users can independently verify that the
 * installed binary matches a specific published release.
 *
 * Usage:
 *   npx tsx scripts/stampBuildIntegrity.ts
 *
 * Safe to run multiple times: subsequent runs overwrite the previous stamp.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const APP_JSON = resolve(__dirname, '..', 'app.json');

function git(args: string[]): string {
  try {
    return execFileSync('git', args, { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

const commit = git(['rev-parse', 'HEAD']) || 'unknown';
const commitShort = commit === 'unknown' ? 'unknown' : commit.slice(0, 7);
const timestamp = new Date().toISOString();

const raw = readFileSync(APP_JSON, 'utf8');
const parsed = JSON.parse(raw) as {
  expo: { extra?: { buildIntegrity?: Record<string, string> } };
};

if (!parsed.expo.extra) parsed.expo.extra = {};
parsed.expo.extra.buildIntegrity = {
  commit,
  commitShort,
  buildTimestamp: timestamp,
};

writeFileSync(APP_JSON, JSON.stringify(parsed, null, 2) + '\n', 'utf8');

console.log(`Stamped build integrity: ${commitShort} @ ${timestamp}`);
