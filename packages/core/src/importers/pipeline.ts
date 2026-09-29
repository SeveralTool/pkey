/**
 * @fileoverview Low-level import pipeline: parse, map columns, and dedupe cards.
 */

import type { PasswordCard } from '../types';
import { generateSecureId } from '../util/secureRandom';
import { buildCardLinkFields, collectIdentities, hostsOf, androidPackagesOf } from '../links';
import type {
  ApplyImportMappingResult,
  ColumnMapping,
  ImportFileInput,
  ImportSkippedCard,
  ParsedImport,
  PkeyField,
} from './types';
import { detectFormat } from './formatDetectors/registry';
import { getParser } from './parsers';
import { sanitizeRows } from './sanitizer';

const POSITION_MAPPINGS: PkeyField[][] = [
  ['title', 'link', 'username'],
  ['title', 'link', 'username', 'passwordList'],
];

/**
 * Detects format and parses an import file into headers/rows.
 *
 * @param input - File name, text content, and optional binary bytes.
 * @returns Parsed rows and detected {@link ImportFormat}.
 */
export function parseImportFile(input: ImportFileInput): ParsedImport {
  const format = detectFormat(input);

  if (format === 'onepassword' && !input.bytes?.length && !input.content?.trim()) {
    return { headers: [], rows: [], format: 'onepassword' };
  }

  const parser = getParser(format === 'unknown' ? 'csv' : format);
  const content =
    format === 'onepassword' && input.bytes?.length ? input.bytes : input.content;
  try {
    const parsed = parser.parse(content, input.name);

    if (format === 'unknown') {
      return {
        ...parsed,
        format: parsed.rows.length ? 'csv' : 'unknown',
      };
    }

    return parsed;
  } catch {
    return { headers: [], rows: [], format: format === 'unknown' ? 'unknown' : format };
  }
}

/**
 * Treats the first header row as data when the CSV has no real headers,
 * synthesizing `column_N` names and a positional suggested mapping.
 *
 * @param parsed - Parse result whose `headers` are actually first-row values.
 * @returns Remapped parse with synthetic headers and suggested mapping.
 */
export function applyHeaderlessImport(parsed: ParsedImport): ParsedImport {
  if (!parsed.headers.length) return parsed;

  const syntheticHeaders = parsed.headers.map((_, i) => `column_${i + 1}`);
  const firstRow: Record<string, string> = {};
  parsed.headers.forEach((val, i) => {
    firstRow[syntheticHeaders[i]!] = val;
  });

  const remappedRows = parsed.rows.map((row) => {
    const newRow: Record<string, string> = {};
    parsed.headers.forEach((oldH, i) => {
      newRow[syntheticHeaders[i]!] = row[oldH] ?? '';
    });
    return newRow;
  });

  const colCount = syntheticHeaders.length;
  const positionFields = POSITION_MAPPINGS.find((m) => m.length === colCount);
  const suggestedMapping: ColumnMapping[] = syntheticHeaders.map((h, i) => ({
    sourceHeader: h,
    targetField: positionFields?.[i] ?? 'skip',
  }));

  return {
    ...parsed,
    headers: syntheticHeaders,
    rows: [firstRow, ...remappedRows],
    suggestedMapping,
  };
}

/**
 * Maps raw import rows to {@link PasswordCard} instances using a column mapping.
 *
 * @param rows - Parsed row objects keyed by source header.
 * @param mapping - Column-to-field mapping.
 * @returns Cards plus field truncation/empty-password warnings.
 */
export function applyImportMapping(
  rows: Record<string, string>[],
  mapping: ColumnMapping[]
): ApplyImportMappingResult {
  const now = new Date().toISOString();
  const { partials, warnings } = sanitizeRows(rows, mapping);

  const cards: PasswordCard[] = partials.map((partial) => {
    const fields = buildCardLinkFields([partial.link, ...(partial.uris ?? [])]);
    return {
      id: generateSecureId('import'),
      type: 'PASSWORD',
      title: partial.title,
      icon: { type: 'icon', value: 'key-outline' },
      username: partial.username,
      passwordList: partial.passwordList,
      link: fields.link,
      ...(fields.uris ? { uris: fields.uris } : {}),
      notes: partial.notes,
      creation_date: now,
      last_update: now,
      tags: partial.tags,
      ...(partial.otpSecret ? { otpSecret: partial.otpSecret } : {}),
      ...(partial.otpAlgorithm ? { otpAlgorithm: partial.otpAlgorithm } : {}),
      ...(partial.otpDigits ? { otpDigits: partial.otpDigits } : {}),
      ...(partial.otpPeriod ? { otpPeriod: partial.otpPeriod } : {}),
    };
  });

  return { cards, warnings };
}

/**
 * Filters incoming cards that duplicate existing vault cards or each other
 * (fingerprint: lowercase `title|username|link`).
 *
 * @param incoming - Newly mapped cards.
 * @param existing - Cards already in the vault.
 * @returns Cards to import, skip count, and detailed skip list.
 */
export function dedupeImportCards(
  incoming: PasswordCard[],
  existing: PasswordCard[]
): { toImport: PasswordCard[]; skipped: number; skippedCards: ImportSkippedCard[] } {
  const fp = (c: PasswordCard) => {
    const ids = collectIdentities(c.link || '', c.uris);
    const ident = hostsOf(ids)[0] || androidPackagesOf(ids)[0] || c.link || '';
    return `${c.title}|${c.username}|${ident}`.toLowerCase();
  };
  const existingByFp = new Map(existing.map((c) => [fp(c), c]));
  const seenIncoming = new Set<string>();
  const toImport: PasswordCard[] = [];
  const skippedCards: ImportSkippedCard[] = [];

  for (const card of incoming) {
    const key = fp(card);
    const vaultMatch = existingByFp.get(key);
    if (vaultMatch) {
      const incomingPwd = card.passwordList[0] ?? '';
      const vaultPwd = vaultMatch.passwordList[0] ?? '';
      const reason =
        incomingPwd !== vaultPwd ? 'password_mismatch' : 'duplicate_in_vault';
      skippedCards.push({
        card,
        reason,
        existingTitle: vaultMatch.title,
      });
      continue;
    }
    if (seenIncoming.has(key)) {
      skippedCards.push({ card, reason: 'duplicate_in_file' });
      continue;
    }
    toImport.push(card);
    seenIncoming.add(key);
  }

  return { toImport, skipped: skippedCards.length, skippedCards };
}
