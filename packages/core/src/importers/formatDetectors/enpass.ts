import type { FormatDetector } from './types';
import { asText } from './utils';

export class EnpassJsonDetector implements FormatDetector {
  readonly format = 'enpass' as const;

  detect(content: string | Uint8Array, fileName?: string): boolean {
    const text = asText(content).trim();
    const name = fileName?.toLowerCase() ?? '';
    if (!name.endsWith('.json') && !text.startsWith('{') && !text.startsWith('[')) return false;
    try {
      const parsed = JSON.parse(text);
      const items = Array.isArray(parsed) ? parsed : parsed.items;
      if (!Array.isArray(items) || !items.length) return false;
      const first = items[0];
      return Boolean(first?.title && Array.isArray(first?.fields));
    } catch {
      return false;
    }
  }
}
