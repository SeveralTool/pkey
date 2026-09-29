#!/usr/bin/env node
/**
 * Fail if `@pkey/core` source imports `react-native` or `expo-*`.
 * Comments and string mentions (native provider names) are ignored.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const srcRoot = join(fileURLToPath(new URL('../packages/core/src', import.meta.url)));

const IMPORT_RE =
  /(?:from\s+|import\s*\(\s*|require\s*\(\s*)['"]((?:react-native(?:\/[^'"]*)?)|(?:expo-[^'"]+))['"]/g;

/**
 * @param {string} source
 */
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/**
 * @param {string} dir
 * @param {string[]} out
 */
function walk(dir, out) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      walk(path, out);
      continue;
    }
    if (/\.(ts|tsx|js|mjs|cjs)$/.test(extname(name))) out.push(path);
  }
}

const files = [];
walk(srcRoot, files);

/** @type {string[]} */
const hits = [];
for (const file of files) {
  const body = stripComments(readFileSync(file, 'utf8'));
  IMPORT_RE.lastIndex = 0;
  let match = IMPORT_RE.exec(body);
  while (match) {
    hits.push(`${file}: ${match[1]}`);
    match = IMPORT_RE.exec(body);
  }
}

if (hits.length > 0) {
  console.error('Forbidden RN/Expo imports in @pkey/core:\n' + hits.join('\n'));
  process.exit(1);
}
