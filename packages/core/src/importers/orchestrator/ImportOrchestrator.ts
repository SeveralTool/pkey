/**
 * @fileoverview High-level import analysis and preview orchestration.
 */

import type {
  ColumnMapping,
  ImportAnalysis,
  ImportAnalysisError,
  ImportFileInput,
  ImportFormat,
  ImportPreview,
  ParsedImport,
} from '../types';
import type { PasswordCard } from '../../types';
import { inferMappingFromHeaders } from '../fieldNormalizers';
import { detectFormatFromRegistry } from '../formatDetectors/registry';
import { getParser } from '../parsers';
import { applyHeaderlessImport, applyImportMapping, dedupeImportCards } from '../pipeline';
import { ImportParseError } from '../ImportParseError';
import { createImportLogger } from './logger';
import { validateImportInput } from '../validateImportInput';

const log = createImportLogger();

/**
 * Whether the UI should ask the user to confirm/edit column mapping.
 * Always true for generic CSV; otherwise true when no suggested mapping exists.
 *
 * @param format - Detected import format.
 * @param suggestedMapping - Optional suggested column mapping.
 * @returns `true` when manual mapping is required.
 */
export function computeNeedsMapping(
  format: ImportFormat,
  suggestedMapping?: ColumnMapping[]
): boolean {
  if (format === 'csv') return true;
  return !suggestedMapping?.length;
}

/**
 * Coordinates format detection, parsing, mapping suggestions, and import previews.
 */
export class ImportOrchestrator {
  /**
   * Analyzes an import file: detects format, parses rows, and suggests mapping.
   *
   * @param input - File name, text, and optional binary content.
   * @returns Analysis including preview rows and whether mapping is needed.
   */
  analyze(input: ImportFileInput): ImportAnalysis {
    const analysisErrors: ImportAnalysisError[] = [];

    const gate = validateImportInput(input);
    if (!gate.ok) {
      analysisErrors.push(gate.reason);
      const parsed: ParsedImport = { headers: [], rows: [], format: 'unknown' };
      return {
        format: 'unknown',
        headers: [],
        previewRows: [],
        suggestedMapping: [],
        needsMapping: false,
        analysisErrors,
        parsed,
      };
    }

    const format =
      detectFormatFromRegistry(input.bytes?.length ? input.bytes : input.content, input.name) ??
      'unknown';

    let parsed: ParsedImport;

    if (format === 'onepassword' && !input.bytes?.length && !input.content?.trim()) {
      analysisErrors.push('missing_binary_content');
      parsed = { headers: [], rows: [], format: 'onepassword' };
    } else if (format === 'unknown') {
      const parser = getParser('csv');
      try {
        parsed = parser.parse(input.content);
        parsed = {
          ...parsed,
          format: parsed.rows.length ? 'csv' : 'unknown',
        };
        if (!parsed.headers.length && !parsed.rows.length) {
          analysisErrors.push('unsupported_format');
        }
      } catch (e) {
        analysisErrors.push(
          e instanceof ImportParseError ? e.code : 'parse_failed'
        );
        parsed = { headers: [], rows: [], format: 'unknown' };
      }
    } else {
      const parser = getParser(format);
      const content =
        format === 'onepassword' && input.bytes?.length ? input.bytes : input.content;
      try {
        // Prefer bytes for onepassword when available; also allow plain text content
        if (format === 'onepassword' && !input.bytes?.length && input.content?.trim()) {
          parsed = parser.parse(input.content, input.name);
        } else {
          parsed = parser.parse(content, input.name);
        }
      } catch (e) {
        if (e instanceof ImportParseError) {
          analysisErrors.push(e.code);
        } else {
          analysisErrors.push('parse_failed');
        }
        parsed = { headers: [], rows: [], format };
      }
    }

    const suggestedMapping =
      parsed.suggestedMapping ??
      (parsed.headers.length ? inferMappingFromHeaders(parsed.headers) : []);

    const needsMapping = computeNeedsMapping(parsed.format, parsed.suggestedMapping);

    log.debug('analyze complete', {
      format: parsed.format,
      rows: parsed.rows.length,
      needsMapping,
      errors: analysisErrors.length,
    });

    return {
      format: parsed.format,
      headers: parsed.headers,
      previewRows: parsed.rows.slice(0, 5),
      suggestedMapping,
      needsMapping,
      analysisErrors: analysisErrors.length ? analysisErrors : undefined,
      parsed,
    };
  }

  /**
   * Builds a user-facing import preview: map rows, optionally treat as headerless,
   * then dedupe against the vault.
   *
   * @param opts.parsed - Parsed import data.
   * @param opts.mapping - Confirmed column mapping.
   * @param opts.existingCards - Current vault cards for dedupe.
   * @param opts.headerless - When true, run {@link applyHeaderlessImport} first.
   * @returns Cards to import, skips, warnings, and totals.
   */
  buildPreview(opts: {
    parsed: ParsedImport;
    mapping: ColumnMapping[];
    existingCards: PasswordCard[];
    headerless?: boolean;
  }): ImportPreview {
    let data = opts.parsed;
    if (opts.headerless) {
      data = applyHeaderlessImport(data);
    }
    const { cards, warnings } = applyImportMapping(data.rows, opts.mapping);
    const { toImport, skipped, skippedCards } = dedupeImportCards(cards, opts.existingCards);

    log.debug('preview built', {
      total: cards.length,
      toImport: toImport.length,
      skipped,
      warnings: warnings.length,
    });

    return {
      toImport,
      skipped,
      skippedCards,
      warnings,
      total: cards.length,
    };
  }
}
