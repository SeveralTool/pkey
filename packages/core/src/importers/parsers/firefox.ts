import type { ParsedImport } from '../types';
import { BaseCsvParser } from './base-csv';
import type { ColumnMapping } from '../types';
import { hostnameFromUrl } from '../formatDetectors/utils';

const FIREFOX_TEMPLATE: ColumnMapping[] = [
  { sourceHeader: 'url', targetField: 'link' },
  { sourceHeader: 'hostname', targetField: 'link' },
  { sourceHeader: 'username', targetField: 'username' },
  { sourceHeader: 'password', targetField: 'passwordList' },
  { sourceHeader: 'title', targetField: 'title' },
];

export class FirefoxCsvParser extends BaseCsvParser {
  readonly format = 'firefox' as const;
  readonly columnMapping = FIREFOX_TEMPLATE;

  parse(content: string | Uint8Array): ParsedImport {
    const result = super.parse(content);
    result.rows = result.rows.map((row) => {
      const link = row.url ?? row.hostname ?? '';
      return {
        ...row,
        title: row.title || hostnameFromUrl(link) || row.username || '',
      };
    });
    if (!result.suggestedMapping?.some((m) => m.targetField === 'title')) {
      result.suggestedMapping = [
        ...(result.suggestedMapping ?? []),
        { sourceHeader: 'title', targetField: 'title' },
      ];
    }
    return result;
  }
}
