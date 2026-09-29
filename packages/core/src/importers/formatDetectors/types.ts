import type { ImportFormat } from '../types';

export interface FormatDetector {
  readonly format: ImportFormat;
  detect(content: string | Uint8Array, fileName?: string): boolean;
}
