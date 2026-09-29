import type { FormatDetector } from './types';
import { asText } from './utils';

export class KeeperJsonDetector implements FormatDetector {
  readonly format = 'keeper-json' as const;

  detect(content: string | Uint8Array, fileName?: string): boolean {
    const text = asText(content).trim();
    const name = fileName?.toLowerCase() ?? '';
    if (!name.endsWith('.json') && !text.startsWith('{') && !text.startsWith('[')) return false;
    try {
      const parsed = JSON.parse(text);
      const records = Array.isArray(parsed) ? parsed : (parsed.records ?? parsed.items);
      if (!Array.isArray(records) || !records.length) return false;
      const first = records[0];
      return Boolean(
        (first.login !== undefined || first.$type === 'login') &&
        (first.password !== undefined || first.secret)
      );
    } catch {
      return false;
    }
  }
}
