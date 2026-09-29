import { parseCsv } from '../csv-generic';
import type { ColumnMapping, ImportFormat } from '../types';
import { inferMappingFromHeaders, mapFieldToPkey } from '../fieldNormalizers';
import type { Parser, ParsedResult } from './types';

export abstract class BaseCsvParser implements Parser {
  abstract readonly format: ImportFormat;
  abstract readonly columnMapping: ColumnMapping[];

  parse(content: string | Uint8Array): ParsedResult {
    const text = typeof content === 'string' ? content : new TextDecoder().decode(content);
    const { headers, rows } = parseCsv(text);
    const suggestedMapping = headers.map((h) => {
      const known = this.columnMapping.find(
        (m) => m.sourceHeader.toLowerCase() === h.toLowerCase()
      );
      if (known) return { sourceHeader: h, targetField: known.targetField };
      return { sourceHeader: h, targetField: mapFieldToPkey(h) };
    });
    return {
      format: this.format,
      headers,
      rows,
      suggestedMapping,
    };
  }
}

export function buildMappingFromTemplate(
  headers: string[],
  template: ColumnMapping[]
): ColumnMapping[] {
  return headers.map((h) => {
    const known = template.find((m) => m.sourceHeader.toLowerCase() === h.toLowerCase());
    if (known) return { sourceHeader: h, targetField: known.targetField };
    return { sourceHeader: h, targetField: mapFieldToPkey(h) };
  });
}

export function normalizedRowMapping(keys: string[]): ColumnMapping[] {
  return keys.map((h) => ({
    sourceHeader: h,
    targetField: h === 'password' ? 'passwordList' : (h as ColumnMapping['targetField']),
  }));
}
