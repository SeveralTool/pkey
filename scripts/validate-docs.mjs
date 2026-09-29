#!/usr/bin/env node
/**
 * Validates Markdown documentation: every ```mermaid block must render, and
 * policy rules must hold (no mermaid inside in-app help procedures).
 *
 * Usage:
 *   node scripts/validate-docs.mjs [--dir docs]
 */
import { execFile } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const MMDC = join(ROOT, 'node_modules', '@mermaid-js', 'mermaid-cli', 'src', 'cli.js');

// Files rendered as plain text inside the mobile app must stay diagram-free.
const NO_MERMAID_GLOBS = [
  join(ROOT, 'docs', 'templates', 'procedures'),
  join(ROOT, 'src', 'constants', 'procedures'),
];

const MERMAID_FENCE = /```mermaid[ \t]*\r?\n([\s\S]*?)(?:\r?\n)?```/g;

function collectMarkdownFiles(dir, out) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.git') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) collectMarkdownFiles(full, out);
    else if (entry.endsWith('.md')) out.push(full);
  }
  return out;
}

function extractMermaidBlocks(content) {
  const blocks = [];
  let match;
  while ((match = MERMAID_FENCE.exec(content)) !== null) {
    blocks.push(match[1].trim());
  }
  return blocks;
}

async function main() {
  const argDir = process.argv.find((a) => a.startsWith('--dir='));
  const startDir = argDir ? resolve(ROOT, argDir.slice('--dir='.length)) : ROOT;
  const files = collectMarkdownFiles(startDir, []);

  if (files.length === 0) {
    console.error(`No markdown files found under ${startDir}`);
    process.exit(1);
  }

  const workDir = mkdtempSync(join(tmpdir(), 'pkey-mermaid-check-'));
  const puppeteerConfig = join(workDir, 'puppeteer.json');
  writeFileSync(
    puppeteerConfig,
    JSON.stringify({ args: ['--no-sandbox', '--disable-setuid-sandbox'] }, null, 2)
  );

  let diagramCount = 0;
  let failed = false;
  const failures = [];

  for (const file of files.sort()) {
    const rel = relative(ROOT, file).split(sep).join('/');
    const content = readFileSync(file, 'utf8');
    const blocks = extractMermaidBlocks(content);

    const isProcedures = NO_MERMAID_GLOBS.some((dir) => file.startsWith(dir));
    if (isProcedures && blocks.length > 0) {
      failed = true;
      failures.push(
        `${rel}: contains ${blocks.length} mermaid block(s); forbidden in in-app help procedures`
      );
      continue;
    }

    for (const [i, source] of blocks.entries()) {
      diagramCount += 1;
      const input = join(workDir, `in-${diagramCount}.mmd`);
      const output = join(workDir, `out-${diagramCount}.svg`);
      writeFileSync(input, source);
      try {
        await execFileAsync(
          process.execPath,
          [MMDC, '-i', input, '-o', output, '-q', '-p', puppeteerConfig],
          {
            cwd: workDir,
            timeout: 60000,
          }
        );
      } catch (err) {
        failed = true;
        const detail = (err.stderr || err.stdout || err.message || '').toString().trim();
        failures.push(`${rel}: mermaid block #${i + 1} failed to render\n${detail}`);
      }
    }
  }

  rmSync(workDir, { recursive: true, force: true });

  if (failed) {
    console.error(
      `docs validation failed (${failures.length} problem(s)):\n\n${failures.join('\n\n')}\n`
    );
    process.exit(1);
  }

  console.log(
    `docs validation OK — ${files.length} files scanned, ${diagramCount} mermaid diagram(s) rendered.`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
