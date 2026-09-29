#!/usr/bin/env node
/**
 * Builds static HTML for GitHub Pages (Play privacy/terms URLs) from docs/legal + LICENSE.
 *
 *   npm run legal:site
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('..', import.meta.url)));
const outDir = join(root, 'legal-site');
mkdirSync(outDir, { recursive: true });

const PAGES = [
  { id: 'privacy', title: 'Privacy policy', source: join(root, 'docs/legal/PRIVACY_POLICY.md') },
  { id: 'terms', title: 'Terms of use', source: join(root, 'docs/legal/TERMS_OF_SERVICE.md') },
  {
    id: 'third-party',
    title: 'Third-party notices',
    source: join(root, 'docs/legal/THIRD_PARTY_NOTICES.md'),
  },
  {
    id: 'official-app',
    title: 'Official application',
    source: join(root, 'docs/legal/OFFICIAL_APP.md'),
  },
  { id: 'source-license', title: 'Source license', source: join(root, 'LICENSE'), pre: true },
];

function escapeHtml(text) {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function inline(text) {
  let s = escapeHtml(text);
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  return s;
}

function mdToHtml(md) {
  const lines = md.replaceAll('\r\n', '\n').split('\n');
  const out = [];
  let i = 0;
  let listType = null;

  const closeList = () => {
    if (listType) {
      out.push(listType === 'ul' ? '</ul>' : '</ol>');
      listType = null;
    }
  };

  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith('|') && i + 1 < lines.length && /^\|[\s:|-]+\|/.test(lines[i + 1])) {
      closeList();
      const rows = [];
      while (i < lines.length && lines[i].startsWith('|')) {
        if (!/^\|[\s:|-]+\|/.test(lines[i])) rows.push(lines[i]);
        i += 1;
      }
      out.push('<table>');
      rows.forEach((row, idx) => {
        const cells = row
          .split('|')
          .slice(1, -1)
          .map((c) => c.trim());
        const tag = idx === 0 ? 'th' : 'td';
        out.push('<tr>' + cells.map((c) => `<${tag}>${inline(c)}</${tag}>`).join('') + '</tr>');
      });
      out.push('</table>');
      continue;
    }
    if (line.startsWith('# ')) {
      closeList();
      out.push(`<h1>${inline(line.slice(2))}</h1>`);
    } else if (line.startsWith('## ')) {
      closeList();
      out.push(`<h2>${inline(line.slice(3))}</h2>`);
    } else if (line.startsWith('### ')) {
      closeList();
      out.push(`<h3>${inline(line.slice(4))}</h3>`);
    } else if (line.startsWith('> ')) {
      closeList();
      const parts = [];
      while (i < lines.length && lines[i].startsWith('> ')) {
        parts.push(lines[i].slice(2));
        i += 1;
      }
      out.push(`<blockquote><p>${inline(parts.join(' '))}</p></blockquote>`);
      continue;
    } else if (/^[-*] /.test(line)) {
      if (listType !== 'ul') {
        closeList();
        listType = 'ul';
        out.push('<ul>');
      }
      out.push(`<li>${inline(line.slice(2))}</li>`);
    } else if (line.trim() === '') {
      closeList();
    } else {
      closeList();
      out.push(`<p>${inline(line)}</p>`);
    }
    i += 1;
  }
  closeList();
  return out.join('\n');
}

function pageShell(title, bodyInner) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)} — PKEY</title>
  <style>
    body { font-family: system-ui, sans-serif; line-height: 1.5; max-width: 44rem; margin: 2rem auto; padding: 0 1rem; color: #111; }
    a { color: #0b57d0; }
    nav { margin-bottom: 1.5rem; font-size: 0.9rem; }
    table { border-collapse: collapse; width: 100%; margin: 1rem 0; font-size: 0.95rem; }
    th, td { border: 1px solid #ccc; padding: 0.4rem 0.6rem; text-align: left; }
    pre { white-space: pre-wrap; background: #f4f4f4; padding: 1rem; }
    h1 { font-size: 1.6rem; }
    code { font-size: 0.9em; }
  </style>
</head>
<body>
  <nav><a href="./index.html">PKEY legal</a></nav>
  ${bodyInner}
</body>
</html>
`;
}

const indexLinks = [];
for (const page of PAGES) {
  const raw = readFileSync(page.source, 'utf8');
  const inner = page.pre
    ? `<h1>${escapeHtml(page.title)}</h1><pre>${escapeHtml(raw)}</pre>`
    : mdToHtml(raw);
  writeFileSync(join(outDir, `${page.id}.html`), pageShell(page.title, inner), 'utf8');
  indexLinks.push(`<li><a href="./${page.id}.html">${escapeHtml(page.title)}</a></li>`);
}

writeFileSync(
  join(outDir, 'index.html'),
  pageShell(
    'PKEY legal documents',
    `<h1>PKEY legal documents</h1>
<p>These pages are the public HTTPS copies Play Store and the in-app Legal screen link to. Canonical markdown lives in <code>docs/legal/</code> of the source repository.</p>
<ul>${indexLinks.join('')}</ul>`
  ),
  'utf8'
);

console.log(`Wrote ${PAGES.length + 1} files in ${outDir}`);
