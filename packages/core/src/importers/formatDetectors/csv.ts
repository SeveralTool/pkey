import type { FormatDetector } from './types';
import { asText, csvHeadersInclude, isPlausibleTabularText } from './utils';

export class DashlaneCsvDetector implements FormatDetector {
  readonly format = 'dashlane' as const;

  detect(content: string | Uint8Array, fileName?: string): boolean {
    const text = asText(content);
    const name = fileName?.toLowerCase() ?? '';
    if (!name.endsWith('.csv') && !text.includes(',')) return false;
    return name.includes('dashlane') || csvHeadersInclude(text, ['username1']);
  }
}

export class ChromeCsvDetector implements FormatDetector {
  readonly format = 'chrome' as const;

  detect(content: string | Uint8Array, fileName?: string): boolean {
    const text = asText(content);
    const name = fileName?.toLowerCase() ?? '';
    if (!name.endsWith('.csv') && !text.includes(',')) return false;
    if (csvHeadersInclude(text, ['grouping', 'extra'])) return false;
    return csvHeadersInclude(text, ['name', 'url', 'username', 'password']);
  }
}

export class FirefoxCsvDetector implements FormatDetector {
  readonly format = 'firefox' as const;

  detect(content: string | Uint8Array, fileName?: string): boolean {
    const text = asText(content);
    const name = fileName?.toLowerCase() ?? '';
    if (!name.endsWith('.csv') && !text.includes(',')) return false;
    if (csvHeadersInclude(text, ['name', 'url', 'username', 'password'])) return false;
    return csvHeadersInclude(text, ['url', 'username', 'password']);
  }
}

export class LastPassCsvDetector implements FormatDetector {
  readonly format = 'lastpass' as const;

  detect(content: string | Uint8Array, fileName?: string): boolean {
    const text = asText(content);
    const name = fileName?.toLowerCase() ?? '';
    if (!name.endsWith('.csv') && !text.includes(',')) return false;
    return csvHeadersInclude(text, ['grouping']) && csvHeadersInclude(text, ['extra']);
  }
}

export class KeeperCsvDetector implements FormatDetector {
  readonly format = 'keeper-csv' as const;

  detect(content: string | Uint8Array, fileName?: string): boolean {
    const text = asText(content);
    const name = fileName?.toLowerCase() ?? '';
    if (!name.endsWith('.csv') && !text.includes(',')) return false;
    return csvHeadersInclude(text, ['title', 'login', 'password', 'login url']);
  }
}

export class GenericCsvDetector implements FormatDetector {
  readonly format = 'csv' as const;

  detect(content: string | Uint8Array, fileName?: string): boolean {
    const text = asText(content);
    const name = fileName?.toLowerCase() ?? '';
    if (name.endsWith('.csv') || name.endsWith('.txt')) {
      return isPlausibleTabularText(text) || (name.endsWith('.csv') && text.trim().length > 0);
    }
    return isPlausibleTabularText(text);
  }
}
