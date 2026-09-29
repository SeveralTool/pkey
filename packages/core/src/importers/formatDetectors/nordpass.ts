import type { FormatDetector } from './types';
import { asText } from './utils';

export class NordPassJsonDetector implements FormatDetector {
  readonly format = 'nordpass' as const;

  detect(content: string | Uint8Array, fileName?: string): boolean {
    const text = asText(content).trim();
    const name = fileName?.toLowerCase() ?? '';
    if (!name.endsWith('.json') && !text.startsWith('[')) return false;
    try {
      const parsed = JSON.parse(text);
      return (
        Array.isArray(parsed) &&
        parsed.length > 0 &&
        'name' in parsed[0] &&
        'password' in parsed[0] &&
        !('login' in parsed[0])
      );
    } catch {
      return false;
    }
  }
}
