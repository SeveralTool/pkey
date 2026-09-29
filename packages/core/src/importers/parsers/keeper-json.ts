import type { ColumnMapping, ParsedImport } from '../types';
import type { Parser } from './types';
import { normalizedRowMapping } from './base-csv';
import { ImportParseError } from '../ImportParseError';

interface KeeperRecord {
  title?: string;
  login?: string;
  password?: string;
  secret?: string;
  link?: string;
  url?: string;
  notes?: string;
  $type?: string;
}

export class KeeperJsonParser implements Parser {
  readonly format = 'keeper-json' as const;

  parse(content: string | Uint8Array): ParsedImport {
    const text = typeof content === 'string' ? content : new TextDecoder().decode(content);
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new ImportParseError('parse_failed', 'invalid keeper JSON');
    }
    const records: KeeperRecord[] = Array.isArray(parsed)
      ? parsed
      : ((parsed as { records?: KeeperRecord[]; items?: KeeperRecord[] }).records ??
        (parsed as { items?: KeeperRecord[] }).items ??
        []);
    const rows = records.map((r) => ({
      title: r.title ?? '',
      username: r.login ?? '',
      password: r.password ?? r.secret ?? '',
      link: r.link ?? r.url ?? '',
      notes: r.notes ?? '',
    }));
    const headers = ['title', 'username', 'password', 'link', 'notes'];
    return {
      headers,
      rows,
      format: 'keeper-json',
      suggestedMapping: normalizedRowMapping(headers),
    };
  }
}
