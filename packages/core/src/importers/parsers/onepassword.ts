import { unzipSync } from 'fflate';
import type { ParsedImport } from '../types';
import type { Parser } from './types';
import { normalizedRowMapping } from './base-csv';
import { parseOnePasswordEntries } from './onepassword-entry';
import { ImportParseError } from '../ImportParseError';

const MAX_ZIP_ENTRIES = 500;
const MAX_ZIP_TOTAL_BYTES = 20 * 1024 * 1024;

const HEADERS = ['title', 'username', 'password', 'link', 'notes'];

function isZipMagic(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4b;
}

export function extractZipEntries(bytes: Uint8Array): { name: string; data: Uint8Array }[] {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new ImportParseError('parse_failed', 'invalid zip data');
  }

  const entries = Object.entries(files);
  if (entries.length > MAX_ZIP_ENTRIES) {
    throw new ImportParseError('parse_failed', 'zip has too many entries');
  }

  let total = 0;
  const out: { name: string; data: Uint8Array }[] = [];
  for (const [name, data] of entries) {
    total += data.byteLength;
    if (total > MAX_ZIP_TOTAL_BYTES) {
      throw new ImportParseError('parse_failed', 'zip payload too large');
    }
    out.push({ name, data });
  }
  return out;
}

function toParsedImport(rows: Record<string, string>[]): ParsedImport {
  return {
    headers: HEADERS,
    rows,
    format: 'onepassword',
    suggestedMapping: normalizedRowMapping(HEADERS),
  };
}

export function parseOnePasswordArchive(bytes: Uint8Array): ParsedImport {
  const entries = extractZipEntries(bytes);
  const rows: Record<string, string>[] = [];

  for (const entry of entries) {
    if (!entry.name.endsWith('.1pif')) continue;
    const text = new TextDecoder().decode(entry.data);
    rows.push(...parseOnePasswordEntries(text));
  }

  if (!rows.length) {
    // ZIP without .1pif (e.g. .1pux) — unsupported
    throw new ImportParseError(
      'unsupported_onepassword_format',
      'archive contains no .1pif entries'
    );
  }

  return toParsedImport(rows);
}

export function parseOnePasswordText(text: string): ParsedImport {
  const rows = parseOnePasswordEntries(text);
  return toParsedImport(rows);
}

export class OnePasswordParser implements Parser {
  readonly format = 'onepassword' as const;

  parse(content: string | Uint8Array, fileName?: string): ParsedImport {
    const lowerName = (fileName ?? '').toLowerCase();
    if (lowerName.endsWith('.1pux')) {
      throw new ImportParseError(
        'unsupported_onepassword_format',
        '.1pux format is not supported'
      );
    }

    if (content instanceof Uint8Array && content.length) {
      if (isZipMagic(content)) {
        return parseOnePasswordArchive(content);
      }
      const text = new TextDecoder().decode(content);
      return parseOnePasswordText(text);
    }

    if (typeof content === 'string' && content.trim()) {
      return parseOnePasswordText(content);
    }

    return { headers: [], rows: [], format: 'onepassword' };
  }
}
