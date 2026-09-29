import type { ColumnMapping, ParsedImport } from '../types';
import type { Parser } from './types';
import { normalizedRowMapping } from './base-csv';
import { ImportParseError } from '../ImportParseError';

interface EnpassField {
  type?: string;
  label?: string;
  value?: string;
}

interface EnpassItem {
  title?: string;
  fields?: EnpassField[];
  note?: string;
}

function fieldValue(fields: EnpassField[], ...types: string[]): string {
  for (const t of types) {
    const f = fields.find((x) => x.type?.toLowerCase() === t || x.label?.toLowerCase() === t);
    if (f?.value) return f.value;
  }
  return '';
}

export class EnpassParser implements Parser {
  readonly format = 'enpass' as const;

  parse(content: string | Uint8Array): ParsedImport {
    const text = typeof content === 'string' ? content : new TextDecoder().decode(content);
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new ImportParseError('parse_failed', 'invalid enpass JSON');
    }
    const items: EnpassItem[] = Array.isArray(parsed)
      ? parsed
      : ((parsed as { items?: EnpassItem[] }).items ?? []);
    const rows = items.map((item) => {
      const fields = item.fields ?? [];
      return {
        title: item.title ?? '',
        username: fieldValue(fields, 'username', 'email'),
        password: fieldValue(fields, 'password'),
        link: fieldValue(fields, 'url', 'website'),
        notes: item.note ?? fieldValue(fields, 'note'),
        otpSecret: fieldValue(fields, 'totp'),
      };
    });
    const headers = ['title', 'username', 'password', 'link', 'notes', 'otpSecret'];
    return {
      headers,
      rows,
      format: 'enpass',
      suggestedMapping: normalizedRowMapping(headers),
    };
  }
}
