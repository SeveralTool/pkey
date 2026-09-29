import type { FormatDetector } from './types';
import { asText } from './utils';

export class BitwardenJsonDetector implements FormatDetector {
  readonly format = 'bitwarden' as const;

  detect(content: string | Uint8Array, fileName?: string): boolean {
    const text = asText(content).trim();
    const name = fileName?.toLowerCase() ?? '';
    if (!name.endsWith('.json') && !text.startsWith('{') && !text.startsWith('[')) return false;
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed) && parsed[0]?.login && typeof parsed[0].login === 'object') {
        return true;
      }
      if (parsed.items && Array.isArray(parsed.items)) {
        const first = parsed.items[0];
        if (first?.fields && Array.isArray(first.fields)) return false;
        return true;
      }
      if (parsed.folders !== undefined && parsed.items) return true;
    } catch {
      return false;
    }
    return false;
  }
}
