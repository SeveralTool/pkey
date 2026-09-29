import type { ColumnMapping, ParsedImport } from '../types';
import type { Parser } from './types';
import { normalizedRowMapping } from './base-csv';
import { ImportParseError } from '../ImportParseError';

interface BitwardenItem {
  name?: string;
  login?: {
    username?: string;
    password?: string;
    uris?: { uri?: string }[];
    totp?: string;
  };
  notes?: string;
}

export function parseBitwardenJson(content: string): ParsedImport {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new ImportParseError('parse_failed', 'invalid bitwarden JSON');
  }
  const items: BitwardenItem[] = Array.isArray(parsed)
    ? parsed
    : ((parsed as { items?: BitwardenItem[] }).items ?? []);

  const rows: Record<string, string>[] = items
    .filter((item) => item.login || item.name)
    .map((item) => {
      const uris = (item.login?.uris ?? []).map((u) => u.uri ?? '').filter(Boolean);
      return {
        title: item.name ?? '',
        username: item.login?.username ?? '',
        password: item.login?.password ?? '',
        link: uris[0] ?? '',
        uris: uris.slice(1).join('\n'),
        notes: item.notes ?? '',
        otpSecret: item.login?.totp ?? '',
      };
    });

  const headers = ['title', 'username', 'password', 'link', 'notes', 'otpSecret'];
  const suggestedMapping: ColumnMapping[] = normalizedRowMapping(headers);

  return { headers, rows, format: 'bitwarden', suggestedMapping };
}

export class BitwardenParser implements Parser {
  readonly format = 'bitwarden' as const;

  parse(content: string | Uint8Array): ParsedImport {
    const text = typeof content === 'string' ? content : new TextDecoder().decode(content);
    return parseBitwardenJson(text);
  }
}
