import { parseCsv } from '../csv-generic';
import { inferMappingFromHeaders } from '../fieldNormalizers';
import type { ParsedImport } from '../types';
import type { Parser } from './types';

export class GenericCsvParser implements Parser {
  readonly format = 'csv' as const;

  parse(content: string | Uint8Array): ParsedImport {
    const text = typeof content === 'string' ? content : new TextDecoder().decode(content);
    const { headers, rows } = parseCsv(text);
    return {
      headers,
      rows,
      format: 'csv',
      suggestedMapping: headers.length ? inferMappingFromHeaders(headers) : undefined,
    };
  }
}
