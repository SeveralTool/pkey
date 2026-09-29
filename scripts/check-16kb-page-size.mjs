#!/usr/bin/env node
/**
 * Checks ELF shared libraries for Android 15+ 16 KB page-size alignment.
 *
 * Usage:
 *   node scripts/check-16kb-page-size.mjs                 # prints how-to
 *   node scripts/check-16kb-page-size.mjs path/to/lib.so
 *   node scripts/check-16kb-page-size.mjs path/to.aab
 *   node scripts/check-16kb-page-size.mjs path/to.apk
 *
 * Play Console remains authoritative (App bundle explorer → Memory page size).
 * This script is a pre-upload filter for native .so files inside an AAB/APK.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, extname, join } from 'node:path';

const PAGE = 16384;
const PT_LOAD = 1;

/**
 * @typedef {{ name: string, ok: boolean, detail: string }} ElfCheck
 */

/**
 * Inspects one ELF buffer for PT_LOAD p_align >= 16 KB.
 * @param {Buffer} buf
 * @param {string} name
 * @returns {ElfCheck}
 */
export function inspectElf16k(buf, name) {
  if (buf.length < 64) return { name, ok: false, detail: 'too small to be ELF' };
  if (buf[0] !== 0x7f || buf[1] !== 0x45 || buf[2] !== 0x4c || buf[3] !== 0x46) {
    return { name, ok: false, detail: 'not ELF' };
  }
  const little = buf[5] === 1;
  const eiClass = buf[4];
  const u16 = (off) => (little ? buf.readUInt16LE(off) : buf.readUInt16BE(off));
  const u32 = (off) => (little ? buf.readUInt32LE(off) : buf.readUInt32BE(off));
  const u64 = (off) => Number(little ? buf.readBigUInt64LE(off) : buf.readBigUInt64BE(off));

  /** @type {number[]} */
  const aligns = [];
  try {
    if (eiClass === 2) {
      const phoff = u64(32);
      const phentsize = u16(54);
      const phnum = u16(56);
      for (let i = 0; i < phnum; i++) {
        const off = phoff + i * phentsize;
        if (off + 56 > buf.length) break;
        if (u32(off) !== PT_LOAD) continue;
        const memsz = u64(off + 40);
        const align = u64(off + 48);
        if (memsz > 0 && align > 0) aligns.push(align);
      }
    } else if (eiClass === 1) {
      const phoff = u32(28);
      const phentsize = u16(42);
      const phnum = u16(44);
      for (let i = 0; i < phnum; i++) {
        const off = phoff + i * phentsize;
        if (off + 32 > buf.length) break;
        if (u32(off) !== PT_LOAD) continue;
        const memsz = u32(off + 20);
        const align = u32(off + 28);
        if (memsz > 0 && align > 0) aligns.push(align);
      }
    } else {
      return { name, ok: false, detail: `unknown ELF class ${eiClass}` };
    }
  } catch (e) {
    return { name, ok: false, detail: e instanceof Error ? e.message : 'parse error' };
  }

  if (aligns.length === 0) {
    return { name, ok: true, detail: 'no PT_LOAD segments with alignment' };
  }
  const minAlign = Math.min(...aligns);
  if (minAlign < PAGE) {
    return {
      name,
      ok: false,
      detail: `LOAD p_align ${minAlign} < ${PAGE} (16 KB)`,
    };
  }
  return { name, ok: true, detail: `LOAD p_align >= ${minAlign}` };
}

function listZipEntries(archive) {
  const out = execFileSync('tar', ['-tf', archive], { encoding: 'utf8' });
  return out
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function extractZipEntry(archive, entry, destFile) {
  const tmp = mkdtempSync(join(tmpdir(), 'pkey-16kb-'));
  try {
    execFileSync('tar', ['-xf', archive, '-C', tmp, entry], { stdio: 'ignore' });
    const extracted = join(tmp, entry);
    writeFileSync(destFile, readFileSync(extracted));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

/**
 * @param {string} archive
 * @returns {ElfCheck[]}
 */
export function inspectArchive16k(archive) {
  const entries = listZipEntries(archive);
  /** @type {ElfCheck[]} */
  const results = [];
  const soEntries = entries.filter((e) => e.toLowerCase().endsWith('.so'));
  const apkEntries = entries.filter((e) => e.toLowerCase().endsWith('.apk'));

  const tmp = mkdtempSync(join(tmpdir(), 'pkey-16kb-so-'));
  try {
    for (const so of soEntries) {
      const dest = join(tmp, `so-${results.length}.so`);
      extractZipEntry(archive, so, dest);
      results.push(inspectElf16k(readFileSync(dest), `${basename(archive)}:${so}`));
    }
    for (const apk of apkEntries) {
      const dest = join(tmp, `apk-${results.length}.apk`);
      extractZipEntry(archive, apk, dest);
      results.push(...inspectArchive16k(dest).map((r) => ({ ...r, name: `${apk}:${r.name}` })));
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  return results;
}

function printHelp() {
  console.log(`Check Android 16 KB ELF alignment (Play target API 35+).

  npm run check:16kb -- path/to/app.aab
  npm run check:16kb -- path/to/libfoo.so

If no file is passed, this is not a failure: download the production AAB and
re-run, or use Play Console → App bundle explorer → Memory page size.

Native suspects if this fails: react-native-tcp-socket, zeroconf, quick-crypto,
nitro-modules, pkey-autofill, pkey-web-access. Do not lower targetSdk to hide it.
`);
}

function main(argv) {
  const file = argv[0];
  if (!file) {
    printHelp();
    process.exit(0);
  }
  const ext = extname(file).toLowerCase();
  /** @type {ElfCheck[]} */
  let results;
  if (ext === '.so') {
    results = [inspectElf16k(readFileSync(file), basename(file))];
  } else if (ext === '.aab' || ext === '.apk' || ext === '.zip') {
    results = inspectArchive16k(file);
  } else {
    console.error(`Unsupported file type: ${ext || '(none)'}`);
    process.exit(2);
  }

  if (results.length === 0) {
    console.error(`No .so files found in ${file}`);
    process.exit(2);
  }

  let failed = 0;
  for (const r of results) {
    const mark = r.ok ? 'ok' : 'FAIL';
    if (!r.ok) failed += 1;
    console.log(`${mark}\t${r.name}\t${r.detail}`);
  }
  console.log(`${results.length - failed} ok, ${failed} failed, ${results.length} libraries`);
  process.exit(failed > 0 ? 1 : 0);
}

const isDirect =
  process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('check-16kb-page-size.mjs');
if (isDirect) {
  main(process.argv.slice(2));
}
