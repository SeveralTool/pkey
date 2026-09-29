import type { FormatDetector } from './types';
import { isZipMagic, zipContains1pif } from './utils';

export class OnePasswordDetector implements FormatDetector {
  readonly format = 'onepassword' as const;

  detect(content: string | Uint8Array, fileName?: string): boolean {
    const name = fileName?.toLowerCase() ?? '';
    if (name.endsWith('.1pif')) return true;
    if (content instanceof Uint8Array && isZipMagic(content)) {
      return zipContains1pif(content);
    }
    return false;
  }
}
