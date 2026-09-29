import type { ColumnMapping, ParsedImport } from '../types';
import type { Parser } from './types';
import { normalizedRowMapping } from './base-csv';
import { ImportParseError } from '../ImportParseError';

interface NordPassItem {
  name?: string;
  username?: string;
  email?: string;
  password?: string;
  url?: string;
  note?: string;
  otp?: string;
  folder?: string;
}

export class NordPassParser implements Parser {
  readonly format = 'nordpass' as const;

  parse(content: string | Uint8Array): ParsedImport {
    const text = typeof content === 'string' ? content : new TextDecoder().decode(content);
    let data: NordPassItem[];
    try {
      data = JSON.parse(text);
    } catch {
      throw new ImportParseError('parse_failed', 'invalid nordpass JSON');
    }
    if (!Array.isArray(data)) {
      throw new ImportParseError('parse_failed', 'nordpass JSON must be an array');
    }
    const rows = data.map((item) => ({
      title: item.name ?? '',
      username: item.username ?? item.email ?? '',
      password: item.password ?? '',
      link: item.url ?? '',
      notes: item.note ?? '',
      otpSecret: item.otp ?? '',
      tags: item.folder ?? '',
    }));
    const headers = ['title', 'username', 'password', 'link', 'notes', 'otpSecret', 'tags'];
    const suggestedMapping: ColumnMapping[] = [
      ...normalizedRowMapping(['title', 'username', 'password', 'link', 'notes', 'otpSecret']),
      { sourceHeader: 'tags', targetField: 'tags' },
    ];
    return { headers, rows, format: 'nordpass', suggestedMapping };
  }
}
